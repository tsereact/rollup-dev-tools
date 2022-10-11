import type { Readable } from "stream";
import type { Socket } from "net";
import type { WebSocket } from "ws";

import { GlobalWebSocket } from "./globals";

const good: any = {};

function isNode() {
    if (typeof process !== "object" || !process) {
        return false;
    }

    const { versions } = process;
    if (typeof versions !== "object" || !versions) {
        return false;
    }

    const { node } = versions;
    return typeof node === "string";
}

async function createDecoder() {
    const { Readable } = await import("stream");
    return new Readable({
        encoding: "utf-8",
        read() {},
    })
}

async function request(port: string, protocol?: string) {
    const url = new URL(port);
    url.protocol = url.protocol.replace("ws", "http");

    const http = await import("http");
    const https = await import("https");
    const { request } = url.protocol === "https" ? https : http;
    const decoder = await createDecoder();
    const req = request(url, {
        headers: { connection: "upgrade", upgrade: protocol || "ipc" }
    });

    return new Promise<[Socket, Readable]>((resolve, reject) => {
        req.on("error", ex => {
            req.removeAllListeners();
            reject(ex);
        });

        req.on("close", () => {
            req.removeAllListeners();
            reject(new Error("IPC request closed without upgrade."))
        });

        req.on("response", res => {
            req.removeAllListeners();
            res.resume();
            reject(new Error("IPC request failed without upgrade."))
        });

        req.on("upgrade", (_, socket, head) => {
            req.removeAllListeners();
            socket.pause();
            socket.unshift(head);
            resolve([socket, decoder]);
        });

        req.end();
    });    
}

export type MessageType = "message" | "ping" | "pong";

export interface Handler {
    (type: MessageType, body: any): any;
}

export abstract class IpcSocket {
    private backlog: string[] = [];
    private endPromise!: Promise<void>;
    private endResolve!: () => void;
    private handlers = new Map<any, Handler>();

    protocols?: string;
    error?: Error | null;

    abstract send(type: MessageType, body: any): boolean;
    abstract close(error?: Error | null): boolean;

    protected last() {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { backlog, handlers, endResolve } = this;
        backlog.length = 0;
        handlers.clear();
        endResolve();

        return true;
    }

    protected push(data: string) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { backlog } = this;
        backlog.push(data);

        if (!this.handlers.size) {
            return true;
        }

        if (data.indexOf("\n") >= 0) {
            const lines = backlog.join("").split(/\r?\n/);
            backlog.length = 0;
            backlog.push(lines.pop() || "");

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (Array.isArray(json)) {
                        const [type, body] = json;
                        if (typeof type === "string") {
                            this.emit(type as any, body);
                        }
                    }
                } catch {
                    // don't care
                }
            }
        }

        return true;
    }

    protected emit(type: MessageType, body: any) {
        if (Object.isFrozen(this)) {
            return false;
        }

        if (type === "ping") {
            this.send("pong", body);
        }

        const { handlers } = this;
        handlers.forEach(async (handler, ticket) => {
            await (0 as any);
            if (handlers.get(ticket) === handler) {
                handler(type, body)
            }
        });

        return true;
    }

    constructor() {
        this.endPromise = new Promise(x => this.endResolve = x);
    }

    off(key: any) {
        if (Object.isFrozen(this)) {
            return false;
        }

        this.handlers.delete(key);
        return true;
    }

    on(key: any, handler: Handler) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { backlog, handlers } = this;
        handlers.set(key, handler);

        const log = backlog.join("");
        backlog.length = 0;
        this.push(log);

        return true;
    }

    async keepAlive() {
        if (Object.isFrozen(this)) {
            return false;
        }

        let ticket = good;
        const timer = setInterval(() => {
            if (ticket !== good) {
                this.close();
            } else {
                ticket = (new Date()).valueOf();
                this.send("ping", ticket);
            }
        }, 25000);

        this.on({}, (type, data) => {
            if (type === "pong" && data === ticket) {
                ticket = good;
            }
        });

        await this.wait();
        clearInterval(timer);
        
        return true;
    }

    async wait() {
        if (Object.isFrozen(this)) {
            return false;
        }

        await this.endPromise;
        return true;
    }

    static acceptNativeSocket(socket: Socket, decoder: Readable, proto?: string) {
        return new NativeIpcSocket(socket, decoder, proto);
    }

    static acceptWebSocket(ws: WebSocket, proto?: string) {
        return new WebIpcSocket(ws, proto);
    }

    static async connect(port: string, proto?: string): Promise<IpcSocket> {
        try {
            if (GlobalWebSocket) {
                return new GlobalWebIpcSocket(new GlobalWebSocket(port, proto), proto);
            }
    
            if (!isNode()) {
                new Error("IPC method not available.");
            }
    
            const [socket, decoder] = await request(port, proto);
            return new NativeIpcSocket(socket, decoder, proto);
        } catch (ex: any) {
            return new ErrorIpcSocket(ex, proto);
        }
    }
}

function chunk(list: string[], type: MessageType, body: any) {
    let j = 0;
    const data = JSON.stringify([type, body]);
    for (let i = 0; i < data.length; i = j) {
        j += 8192;
        list.push(data.substring(i, j))
    }

    list.push("\n");
    return list;
}

function drain(ws: Pick<GlobalWebSocket, "send" | "readyState" | "OPEN">, data: string[]) {
    if (ws.readyState === ws.OPEN) {
        for (const part of data) {
            ws.send(part);
        }    

        data.length = 0;
    }
}

class GlobalWebIpcSocket extends IpcSocket {
    private data: string[] = [];
    private ws: GlobalWebSocket;

    constructor(ws: GlobalWebSocket, proto?: string) {
        super();
        this.ws = ws;
        this.protocols = proto;

        ws.addEventListener("open", () => drain(ws, this.data));
        ws.addEventListener("message", e => this.push(e.data));
        ws.addEventListener("error", () => this.close(null));
        ws.addEventListener("close", () => this.close());

        if (ws.readyState > ws.OPEN) {
            this.close(null);
        }
    }

    close(error?: Error | null) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { ws } = this;
        if (ws.readyState === ws.CONNECTING) {
            ws.addEventListener("open", () => ws.close());
        }

        if (ws.readyState === ws.OPEN) {
            ws.close();
        }

        this.error = error;
        return this.last();
    }

    send(type: MessageType, body: any) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { data, ws } = this;
        if (ws.readyState > ws.OPEN) {
            return false;
        }

        chunk(data, type, body);
        drain(ws, data);

        return true;
    }
}

class WebIpcSocket extends IpcSocket {
    private data: string[] = [];
    private ws: WebSocket;

    constructor(ws: WebSocket, proto?: string) {
        super();
        this.ws = ws;
        this.protocols = proto;

        ws.on("open", () => drain(ws, this.data));
        ws.on("message", data => this.push(data.toString()));
        ws.on("error", ex => this.close(ex));
        ws.on("close", () => this.close());

        ws.on("ping", data => {
            this.emit("ping", JSON.parse(data.toString()));
        });

        ws.on("pong", data => {
            this.emit("pong", JSON.parse(data.toString()));
        });

        if (ws.readyState > ws.OPEN) {
            this.close();
        }
    }

    close(error?: Error | null) {
        if (Object.isFrozen(this)) {
            return false;
        }
        
        const { ws } = this;
        ws.removeAllListeners();
        ws.on("error", () => {});
        ws.terminate();

        this.error = error;
        return this.last();
    }

    send(type: MessageType, body: any) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { data, ws } = this;
        if (ws.readyState === ws.OPEN) {
            if (type === "ping") {
                ws.ping(JSON.stringify(body))
                return true;
            }

            if (type === "pong") {
                ws.pong(JSON.stringify(body))
                return true;
            }
        }

        if (ws.readyState > ws.OPEN) {
            return false;
        }

        chunk(data, type, body);
        drain(ws, data);

        return true;
    }
}

class NativeIpcSocket extends IpcSocket {
    private socket: Socket;
    private decoder: Readable;

    constructor(socket: Socket, decoder: Readable, proto?: string) {
        super();
        this.socket = socket;
        this.decoder = decoder;
        this.protocols = proto;

        decoder.on("data", data => this.push(data));
        socket.on("data", data => decoder.push(data));
        socket.on("end", () => this.close());
        socket.on("error", ex => this.close(ex));
        socket.on("close", () => this.close());
        socket.resume();

        if (socket.destroyed) {
            this.close(null);
        }
    }

    close(error?: Error | null) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { socket, decoder } = this;
        socket.removeAllListeners();
        decoder.removeAllListeners();
        socket.on("error", () => {});
        socket.destroy();
        decoder.destroy();

        this.error = error;
        return this.last();
    }

    send(type: MessageType, body: any) {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { socket } = this;
        socket.write(JSON.stringify([type, body]));
        socket.write("\n");
        
        return true;
    }
}

class ErrorIpcSocket extends IpcSocket {
    constructor(error: Error | null, proto?: string) {
        super();
        this.error = error;
        this.protocols = proto;

        this.last();
    }

    close() {
        return false;
    }

    send() {
        return false;
    }
}

export default IpcSocket;
