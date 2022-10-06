import { createServer as createHttpServer, Server } from "http";
import { lookupService } from "dns/promises";
import { isRunMode } from "./modes";

import connect, { ConnectHandler } from "../core/connect";
import * as serve from "../core/serve";

let handler: ConnectHandler | undefined;
let handlerPromise: Promise<boolean> | undefined;
let listenPromise: Promise<string> | undefined;
let unblock = () => {};

const configures = [] as Configure[];
const defaultPort = Number(process.env.PORT || "8380");
const locks = new Set<any>();

async function handlerInit() {
    while (locks.size > 0) {
        await new Promise<void>(x => unblock = x);
    }

    let valid = true;
    unblock = () => {
        handler = undefined;
        handlerPromise = undefined;
        valid = false;
    };
    
    const result = connect();
    const paths: [string, string][] = [];
    for (const configure of configures) {
        await configure(result, paths);
    }

    result.use(serve.files(paths));

    if (valid) {
        handler = result;
    }

    return true;
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

    const server = await createServer();
    server.on("request", async (req, res) => {
        let done: any;
        let loop: any = true;
        while (!handler && loop) {
            if (done === undefined) {
                done = new Promise<any>(x => req.once("close", x));
            }

            if (handlerPromise === undefined) {
                handlerPromise = handlerInit();
            }
            
            loop = await Promise.race([handlerPromise, done]);
        }

        if (handler && !req.destroyed) {
            handler(req, res);
        }
    });

    const promise = new Promise<string>(resolve => {
        server.on("listening", () => {
            const proto = isHttp(server) ? "http" : "https";
            const addr = server.address();
            if (addr && typeof addr === "object") {
                resolve(`${proto}://${fqdn}:${addr.port}/`);
            } else {
                resolve(`${proto}://${fqdn}:${port}/`);
            }
        });
    })

    server.on("error", err => {
        console.warn("[WebServer]: Could not listen on %s:%s [ERROR: %s]", host, port, err.message);
        server.removeAllListeners("error");

        server.listen(0, host !== "*" ? host : undefined);
    });

    server.listen(port, host !== "*" ? host : undefined);
    return promise;
}

export interface Configure {
    (connect: ConnectHandler, paths: [string, string][]): Promise<void> | void;
}

export interface ServerOptions {
    host?: string;
    port?: number;
    createServer?: () => Server | Promise<Server>;
}

export function configure(fn: Configure) {
    if (isRunMode()) {
        configures.push(fn);
        refresh();
    }
}

export function start(options?: ServerOptions) {
    if (listenPromise) {
        return listenPromise;
    }

    if (isRunMode()) {
        const { port, host, createServer } = options || {};
        return listenPromise = listenInit(port, host, createServer);
    }

    return listenPromise = Promise.resolve("");
}

export function block(lock?: any) {
    locks.add(lock);
    refresh();
}

export function refresh() {
    if (handler) {
        handler = undefined;
        handlerPromise = undefined;
    }

    if (locks.size < 1) {
        unblock();
    }

    return locks.size < 1;
}
