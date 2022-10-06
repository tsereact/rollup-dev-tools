import { lookupService } from "dns/promises";
import { Server, IncomingMessage, ServerResponse, createServer as createHttpServer  } from "http";
import { isWatchMode } from "./modes";

import IpcSocket from "./IpcSocket";
import IpcSocketServer from "./IpcServer";
import IpcStateHub from "./IpcStateHub";
import IpcClient from "./IpcClient";

const defaultPort = 7180;
const hub = new IpcStateHub();
const client = new IpcClient("", hub);

let listenPromise: Promise<string> | undefined;

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

function handleUpgrade(ipc: IpcSocket, url?: string) {
    hub.sync(ipc, parseFilter(url || ""));
    hub.sync(ipc);
    ipc.keepAlive();
}

function isHttp(server: Server) {
    return Object.getPrototypeOf(server) === Server.prototype;
}

async function listenInit(port = defaultPort, host = "localhost", createServer: () => Server | Promise<Server> = createHttpServer) {
    let fqdn = host;
    if (host === "*") {
        const { hostname } = await lookupService("0.0.0.0", 0);
        fqdn = hostname;
    }

    const ipc = new IpcSocketServer();
    const server = await createServer();
    server.on("request", handleRequest);
    server.on("upgrade", ipc.handleUpgrade);
    ipc.on("accept", handleUpgrade);

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

    server.listen(port, host !== "*" ? host : undefined);

    return promise;
}

export interface ServerOptions {
    host?: string;
    port?: number;
    createServer?: () => Server | Promise<Server>;
}

export function start(options?: ServerOptions) {
    if (listenPromise) {
        client.sync();
        return listenPromise;
    }

    if (isWatchMode()) {
        const { ROLLUP_IPC_PORT } = process.env;
        if (ROLLUP_IPC_PORT) {
            client.port = ROLLUP_IPC_PORT;
            client.sync();

            return listenPromise = Promise.resolve(ROLLUP_IPC_PORT);
        }

        const { port, host, createServer } = options || {};
        return listenPromise = listenInit(port, host, createServer);
    }

    return listenPromise = Promise.resolve("");
}

export function commit(ticket: any, state: any) {
    hub.set(ticket, state);
    start();
}
