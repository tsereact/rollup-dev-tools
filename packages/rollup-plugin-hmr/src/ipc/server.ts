import { lookupService } from "dns/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { Readable } from "stream";
import { WebSocket, WebSocketServer} from "ws";

let init: Promise<string> | undefined;
let stateContent: string | undefined;
let updates = [] as [ticket: any, id: string, chunk: string, gen: number, hash: string][];
const sockets = new Set<Socket | WebSocket>();
const state = new Map<string, [chunk: string, gen: number, hash: string]>();
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

function render() {
    if (stateContent === undefined) {
        const result = Object.fromEntries(state);
        stateContent = JSON.stringify(result);
    }

    return stateContent;
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.method === "GET" && req.url === "/") {
        res.statusCode = 404;
    } else {
        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Type", "application/json; charset=utf-8");

        res.write(render());
    }

    res.end();
}

function now() {
    return (new Date()).valueOf() + "";
}

function read(input: Readable, fn: (line: string) => any) {
    const reader = new Readable({
        encoding: "utf-8",
        read() {
            input.resume();
        },
    });

    const bufs = [] as string[];
    reader.on("data", data => {
        data = data.toString();
        bufs.push(data);

        if (data.indexOf("\n") >= 0) {
            const lines = bufs.join("").split("\n");
            const last = lines.pop() + "";
            lines.forEach(fn);

            bufs.length = 0;
            bufs.push(last);
        }
    });    

    input.pause();
    input.on("data", x => {
        input.pause();
        reader.push(x);
    });
}

function send(socket: Socket | WebSocket) {
    if (socket instanceof WebSocket && socket.readyState === socket.OPEN) {
        socket.send(render());
    }

    if (socket instanceof Socket) {
        socket.write(render());
        socket.write("\n");
    }
}

function handleSocketX(socket: Socket | WebSocket) {
    let timer: any;
    let ticket: any;
    const cleanup = () => {
        sockets.delete(socket);
        socket.removeAllListeners();        

        if (timer !== undefined) {
            timer = undefined;
            clearInterval(timer);
        }

        if (socket instanceof Socket) {
            socket.destroy();
        }

        if (socket instanceof WebSocket) {
            socket.terminate();
        }
    };

    const ping = () => {
        if (ticket !== undefined) {
            cleanup();
        } else {
            ticket = now();

            if (socket instanceof Socket) {
                socket.write(ticket);
                socket.write("\n");
            }

            if (socket instanceof WebSocket) {
                socket.ping(Buffer.from(ticket));
            }
        }
    };

    timer = setInterval(ping, 5000);

    if (socket instanceof Socket) {
        read(socket, data => {
            if (data === ticket) {
                ticket = undefined;
            }
        });
    }

    if (socket instanceof WebSocket) {
        socket.on("pong", data => {
            if (data.toString() === ticket) {
                ticket = undefined;
            }
        });
    }

    socket.on("error", cleanup);
    socket.on("close", cleanup);

    sockets.add(socket);
    send(socket);
}

function handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {    
    if (req.httpVersion === "1.1" && req.url === "/") {
        if (req.headers.upgrade === "hmr") {
            const { connection, upgrade } = req.headers;
            const lines = [
                `HTTP/1.1 101 Switching Protocols\r\n`,
                `Connection: ${connection}\r\n`,
                `Upgrade: ${upgrade}\r\n`,
                "\r\n"
            ];

            socket.unshift(head);
            socket.write(lines.join(""));
            
            return void handleSocketX(socket);
        }

        if (wss.shouldHandle(req)) {
            return void wss.handleUpgrade(req, socket, head, handleSocketX);
        }
    }

    const ver = req.httpVersion;
    const lines = [
        `HTTP/${ver} 400 Bad Request\r\n`,
        `Connection: close\r\n`,
        "\r\n"
    ];

    socket.write(lines.join(""));
    return void socket.end(() => socket.destroy());
}

namespace server {
    export function commit(ticket: any) {
        updates = updates.filter(args => {
            if (args[0] === ticket) {
                const [, id, ...rest] = args;
                state.set(id, rest);
                stateContent = undefined;

                return false;
            }

            return true;
        });

        if (stateContent === undefined) {
            for (const socket of sockets) {
                send(socket);
            }
        }
    }

    export function update(...args: (typeof updates)[number]) {
        updates.push(args);
    }

    export function listen(port = 7180, host = "localhost") {
        if (init) {
            return init;
        }

        const setup = async () => {
            let fqdn = host;
            if (host === "*") {
                const { hostname } = await lookupService("0.0.0.0", 0);
                fqdn = hostname;
            }

            const server = createServer();
            server.on("request", handleRequest);
            server.on("upgrade", handleUpgrade);

            const promise = new Promise<string>(resolve => {
                server.on("listening", () => {
                    const addr = server.address();
                    if (addr && typeof addr === "object") {
                        resolve(`ws://${fqdn}:${addr.port}/`);
                    } else {
                        resolve(`ws://${fqdn}:${port}/`);
                    }
                });    
            })

            server.on("error", err => {
                console.warn("[HMR]: Could not listen on %s:%s [ERROR: %s]", host, port, err.message);
                server.removeAllListeners("error");

                server.listen(port, host !== "*" ? host : undefined);
            });

            server.listen(port, host !== "*" ? host : undefined);

            return promise;
        };

        return init = setup();
    }
}

export default server;
