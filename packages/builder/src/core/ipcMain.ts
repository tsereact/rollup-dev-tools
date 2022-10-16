import { lookupService } from "dns/promises";
import { Server, IncomingMessage, ServerResponse, createServer as createHttpServer  } from "http";
import { isWatchMode } from "./modes";

import { flat } from "./scan";
import { hashIt } from "./ref";
import { resolve } from "path";

import IpcClient from "./IpcClient";
import IpcServer from "./IpcServer";
import IpcSocket from "./IpcSocket";
import IpcStateHub from "./IpcStateHub";
import ScreenCapture from "./ScreenCapture";

const empty: any[] = [];
const defaultPort = 7180;
const hub = new IpcStateHub();
const client = new IpcClient("", hub);
const sockets = new Map<IpcSocket, Promise<void>>();

let capture: ScreenCapture | undefined;
let logInit: any;

let listenPromise: Promise<string> | undefined;
let mainServer: Server | undefined;

client.port = process.env.ROLLUP_IPC_PORT || "";
hub.any = () => true;

function handleRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.method === "GET" && req.url === "/") {
        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Type", "application/json; charset=utf-8");

        const origin = req.headers.origin;
        origin && res.setHeader("Cross-Origin-Allow-Origin", origin);

        res.write(JSON.stringify(hub));
    } else {
        res.statusCode = 404;
    }

    res.end();
}

function parseFilter(url: string) {
    try {
        const filter = new Set<string>();
        const { searchParams } = new URL(url, "http://localhost/")
        for (const key of searchParams.keys()) {
            if (key) {
                filter.add(key);
            }
        }

        if (filter.size) {
            return (state: any) => {
                if (typeof state !== "object" || !state || Array.isArray(state)) {
                    return false;
                }
    
                for (const key in state) {
                    if (filter.has(key)) {
                        return state;
                    }
                }

                return false;
            };
        }
    } catch {
        // don't care
    }

    return undefined;
}

async function handleUpgrade(ipc: IpcSocket, url?: string) {
    await Promise.all([
        hub.sync(ipc, parseFilter(url || "")),
        ipc.keepAlive(),
    ]);
}

function isHttp(server: Server) {
    return Object.getPrototypeOf(server) === Server.prototype;
}

function takeOne(map: Map<any, any>) {
    for (const entry of map) {
        return entry;
    }

    return empty;
}

export function lockInit(hub: IpcStateHub) {
    let ack: any;
    const token = {};
    const held = new Set<any>();
    const queue = new Map<any, any>();
    hub.on({}, (id, { lockReq }) => {
        if (lockReq) {
            if (lockReq === ack) {
                held.add(id);
            } else {
                queue.set(id, lockReq);
            }
        } else {
            held.delete(id);
            queue.delete(id);
        }

        if (!held.size) {
            [id, ack] = takeOne(queue);

            if (ack) {
                held.add(id);
                hub.set(token, { lockAck: ack })
            } else {
                hub.set(token, false);
            }
        }
    });
}

async function listenInit(port = defaultPort, host = "localhost", createServer: () => Server | Promise<Server> = createHttpServer) {
    /*
    const map = new Map<any, number>();
    hub.on({}, (id, state) => {
        if (map.has(id)) {
            id = map.get(id);
        } else {
            map.set(id, id = map.size);
        }

        console.info("---", id, state);
    });*/

    lockInit(hub);

    let fqdn = host;
    if (host === "*") {
        const { hostname } = await lookupService("0.0.0.0", 0);
        fqdn = hostname;
    }

    const ipc = new IpcServer();
    const server = mainServer = await createServer();
    server.on("request", handleRequest);
    server.on("upgrade", ipc.handleUpgrade);
    ipc.on("accept", (socket, url) => {
        const promise = handleUpgrade(socket, url);
        sockets.set(socket, promise);
        promise.then(() => sockets.delete(socket));
    });

    const promise = new Promise<string>(resolve => {
        server.on("listening", () => {
            const proto = isHttp(server) ? "ws" : "wss";
            const addr = server.address();
            if (addr && typeof addr === "object") {
                resolve(`${proto}://${fqdn}:${addr.port}/`);
            } else {
                resolve(`${proto}://${fqdn}:${port}/`);
            }
        });
    })

    server.on("error", err => {
        console.warn("[IPC]: Could not listen on %s:%s [ERROR: %s]", host, port, err.message);
        server.removeAllListeners("error");

        server.listen(0, host !== "*" ? host : undefined);
    });

    server.listen(port, host !== "*" ? host : "localhost");

    return promise.then(port => {
        process.env.ROLLUP_IPC_PORT = port;
        return port;
    });
}

export interface ServerOptions {
    host?: string;
    port?: number;
    createServer?: () => Server | Promise<Server>;
}

export function start(options?: ServerOptions) {
    if (listenPromise) {
        return listenPromise;
    }

    if (isWatchMode() || options) {
        if (client.port) {
            let port = client.port;
            try {
                const url = new URL(port);
                url.searchParams.set("project", "");
                client.port = url.toString();
            } catch {
                // don't care
            }

            client.sync();

            return listenPromise = Promise.resolve(port);
        }

        const { port, host, createServer } = options || {};
        return listenPromise = listenInit(port, host, createServer);
    }

    return listenPromise = Promise.resolve("");
}

export async function shutdown() {
    listenPromise = Promise.resolve("");

    const server = mainServer;
    if (server) {
        for (const socket of sockets.keys()) {
            socket.close();
        }

        await new Promise(x => server.close(x));
    }
}

export function isCapture() {
    return !!capture;
}

export function isMain() {
    return !client.port;
}

export function commit(token: any, state: any) {
    hub.set(token, state);
}

export function registerProject(token: any, project: string) {
    hub.set(token, { project });
}

export function waitForProjects(...projects: (string | Iterable<string>)[]) {
    const set = new Set(flat(projects));
    return new Promise<void>(resolve => {
        const ticket = {};
        if (set.size) {
            hub.on(ticket, (_, { project }) => {
                if (set.delete(project) && !set.size) {
                    hub.off(ticket);
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

export function lockEnter(token: any = {}) {
    return new Promise<any>(done => {
        const ticket = {};
        const id = process.hrtime.bigint();
        const lockReq = hashIt(resolve(), id);
        hub.set(token, { lockReq });

        hub.on(ticket, (_, { lockAck }) => {
            if (lockAck === lockReq) {
                hub.off(ticket);
                done(token);
            }
        });
    });
}

export function lockLeave(token: any) {
    hub.set(token, false);
}

export function captureScreen() {
    if (!capture) {
        capture = new ScreenCapture();
        capture.on("data", data => {
            hub.set({}, { log: [data], logInit });
            logInit = undefined;
        });
    }

    hub.clear((_, { log }) => Array.isArray(log));
    logInit = true;
}

export function captureScreenFlush() {
    if (capture) {
        let data;
        while (data = capture.read()) {
            hub.set({}, { log: [data], logInit });
            logInit = undefined;
        }
    }
}

export function captureScreenOff() {
    if (capture) {
        capture.removeAllListeners();
        capture.destroy();
        capture = undefined;
    }
}

export function emitScreen() {
    return new Promise<string>(async resolve => {
        const list: string[] = [];
        const ticket = {};
        hub.on(ticket, (_, { log }) => {
            if (Array.isArray(log)) {
                list.push(...log);
            }
        });

        await (0 as any);
        hub.off(ticket);

        resolve(list.join(""));
    });
}

