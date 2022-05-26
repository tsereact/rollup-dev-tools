import type { Socket } from "net";

type Action = [owner: any, action: string, fn: () => any];

let stop = () => {};
let running = false;
let url = "";

const actions = new Set<Action>();
const empty = [] as undefined[];
const nop = Promise.resolve();
const states = new Map<string, [chunk: string, gen: number, hash: string]>();

function update(data: string, socket?: Socket) {
    try {
        const json = JSON.parse(data);
        if (typeof json === "number" && socket) {
            socket.write(data);
            socket.write("\n");
        }

        if (typeof json === "object" && json) {
            for (const key in json) {
                const value = json[key];
                if (Array.isArray(value)) {
                    const [chunk, ver, hash] = value;
                    if (typeof chunk === "string" && typeof ver === "number" && isFinite(ver) && typeof hash === "string") {
                        const current = states.get(key);
                        if (current === undefined || ver > current[1]) {
                            states.set(key, [chunk, ver, hash]);
                        }
                    }
                }
            }

            for (const [,, fn] of actions) {
                nop.then(fn);
            }
        }
    } catch {
        // don't care
    }
}

async function read(input: Socket, fn: (line: string) => any) {
    const { Readable } = await import("stream");
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

async function viaSocket(signal: AbortSignal) {
    const http = await import("http");
    if (signal.aborted) {
        return false;
    }

    return new Promise<boolean>(resolve => {
        const { HMR_PORT } = process.env;
        const { hostname, port } = new URL(HMR_PORT || url);
        const req = http.request({
            hostname,
            port,
            path: "/",
            headers: { connection: "upgrade", upgrade: "hmr" }
        });

        signal.addEventListener("abort", () => {
            resolve(false);
            req.removeAllListeners();
            req.destroy();
        });

        req.on("error", () => resolve(true));
        req.on("close", () => resolve(false));

        req.on("response", res => {
            resolve(true);
            res.resume();
        });

        req.on("upgrade", (_, socket, head) => {
            req.removeAllListeners("close");

            signal.addEventListener("abort", () => {
                socket.removeAllListeners();
                socket.destroy();
            });

            socket.unshift(head);
            socket.pause();
            read(socket, line => update(line, socket));

            socket.on("error", () => resolve(true));
            socket.on("close", () => resolve(false));
        });

        req.end();
    });
}

function head(signal: AbortSignal) {
    const promise = fetch(location.href, {
        method: "HEAD",
        cache: "force-cache",
        signal,
    });
    
    return promise.then(x => x.headers, () => new Headers());
}

function isSafe(url: string | URL) {
    url = new URL(url);

    const site = new URL(location.href);
    if (url.hostname !== site.hostname) {
        return false;
    }

    if (url.hostname === "localhost") {
        return true;
    }

    if (url.protocol !== site.protocol) {
        return false;
    }

    return true;
}

async function viaWebSocket(signal: AbortSignal) {
    const headers = await head(signal);
    if (signal.aborted) {
        return false;
    }

    return new Promise<boolean>(resolve => {
        const HMR_PORT = headers.get("X-HMR-Port");
        const port = new URL(HMR_PORT || url, location.href);
        if (!isSafe(port)) {
            return signal.addEventListener("abort", () => resolve(false));
        }

        const ws = new WebSocket(port);
        signal.addEventListener("abort", () => {
            resolve(false);

            if (ws.readyState === ws.OPEN) {
                ws.close();
            }

            if (ws.readyState === ws.CONNECTING) {
                ws.addEventListener("open", () => ws.close());
            }
        });

        ws.addEventListener("message", e => {
            if (typeof e.data === "string") {
                update(e.data);
            }
        });

        ws.addEventListener("close", () => resolve(false));
        ws.addEventListener("error", () => resolve(true));
    });
}

function delay(signal: AbortSignal) {
    if (signal.aborted) {
        return;
    }

    return new Promise<void>(resolve => {
        let timer: any;
        signal.addEventListener("abort", () => {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }

            resolve();
        });

        const tick = () => {
            timer = undefined;
            resolve();
        };

        timer = setTimeout(tick, 5000);
    });
}

function isBrowser() {
    return typeof WebSocket === "function";
}

function isNode() {
    if (typeof WebSocket === "function") {
        return false;
    }

    if (typeof process !== "object" || !process) {
        return false;
    }

    const { versions } = process;
    if (typeof versions !== "object" || !versions) {
        return false;
    }

    if (!versions.node) {
        return false;
    }

    return true;
}

async function connect() {
    const loop = !running;
    while (loop && actions.size) {
        running = true;

        const controller = new AbortController();
        const { signal } = controller;
        stop = () => controller.abort();

        let error = true;
        if (isBrowser()) {
            error = await viaWebSocket(signal);
        }
        
        if (isNode()) {
            error = await viaSocket(signal);
            console.log("--- error", error);
        }

        if (error && actions.size) {
            await delay(controller.signal);
        }

        controller.abort();
        stop = () => {};
    }

    if (loop) {
        running = false;
    }

    if (actions.size > 0) {
        connect();
    }
}

export type Entry = readonly [chunk?: string, ver?: number];

namespace client {
    export function check(action: Action, id: string, ver: number, hash: string): Entry {
        if (!action[0]) {
            return Object.freeze(empty as any);
        }

        const entry = states.get(id) || empty;
        const [chunk, gen, state] = entry;
        if (chunk && gen && gen > ver && hash !== state) {
            action[0] = undefined;
            actions.delete(action);

            if (actions.size < 1) {
                stop();
            }

            return Object.freeze(entry as any);
        }

        return Object.freeze(empty as any);
    }

    export function setup(port: string) {
        url = port;
        connect();
    }

    export function on(owner: any, name: string, fn: () => any) {
        if (name) {
            for (const action of actions) {
                if (action[0] === owner && action[1] === name) {
                    action[0] = undefined;
                    actions.delete(action);
                }
            }

            nop.then(fn);
        }

        const action: Action = [owner, name, fn];
        actions.add(action);
        return action;
    }

    export function off(owner: any) {
        for (const action of actions) {
            if (action[0] === owner) {
                action[0] = undefined;
                actions.delete(action);
            }
        }

        nop.then(() => actions.size || stop());
    }
}

export default client;