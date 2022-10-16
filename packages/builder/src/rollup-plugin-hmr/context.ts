import type IpcConsole from "../core/IpcConsole";

import IpcClient from "../core/IpcClient";
import IpcSocket from "../core/IpcSocket";
import IpcStateHub from "../core/IpcStateHub";

const ns = "https://github.com/tsereact/rollup-dev-tools";

const hub = new IpcStateHub();
const client = new IpcClient("", hub);
const empty = [] as undefined[];

let term: IpcConsole | undefined;

async function resolvePort() {
    if (typeof fetch === "function" && typeof location === "object") {
        try {
            const res = await fetch(location.href, {
                method: "HEAD",
                cache: "only-if-cached",
            });

            const port = res.headers.get("X-IPC-Port");
            if (port) {
                return port;
            }
        } catch {
            // don't care
        }
    }

    if (typeof process === "object") {
        const { ROLLUP_IPC_PORT: port } = process.env;
        if (typeof port === "string") {
            return port;
        }
    }

    return client.port;
}

let port: Promise<string> | string | undefined;
client.connect = async function () {
    if (!port) {
        port = resolvePort();
    }

    port = await port;
    return await IpcSocket.connect(port + "?hmr&log&logInit&logShow");
};

function findGlobal(): any {
    if (typeof window === "object") {
        return window;
    }

    if (typeof self === "object") {
        return self;
    }

    if (typeof global === "object") {
        return global;
    }

    throw new Error("Cannot find global object.");
}

function doImport(self: string, next: string, tag: number) {
    let i = 0;
    self = self.replace(/[^/]+[\\/]*/g, i++ > 0 ? "/.." : ".");

    const baseUrl = new URL(self + "/", import.meta.url);
    const url = new URL(next, baseUrl);
    url.hash = "#" + tag;

    import(url.toString());
}

function doReload() {
    if (typeof window === "object") {
        location.reload();
    }

    if (typeof process === "object") {
        process.exit(251);
    }
}

type Action = "import" | "reload" | ((chunk: string, ver: number) => any);

export class ModuleState {
    readonly id: string;
    readonly ready: boolean;
    readonly ver: number;
    readonly hash: string;
    readonly root: string;
    readonly self: string;
    readonly port: string;

    console?: IpcConsole;
    state: any;

    constructor(ready: boolean, id: string, ver: number, hash: string, root: string, self: string, port: string, state?: any) {
        this.ready = ready;
        this.id = id;
        this.ver = ver;
        this.hash = hash;
        this.root = root;
        this.self = self;
        this.port = port;

        this.state = state;

        if (!this.ready) {
            this.freeze();
        }
    }

    private check(hmr?: [id: string, ver: number, hash: string, root: string, chunk: string][]) {
        if (!hmr) {
            return empty;
        }

        for (const [id, ver, hash, root, chunk] of hmr) {
            if (id === this.id && ver > this.ver && hash !== this.hash && root === this.root) {
                return [chunk, ver] as [string, number];
            }
        }

        return empty;
    }

    onUpdate(action: Action) {
        if (Object.isFrozen(this)) {
            return false;
        }

        if (action === "import") {
            hub.on(this, (_, { hmr }) => {
                const [chunk, ver] = this.check(hmr);
                chunk && doImport(this.self, chunk, ver!);
            });
        }

        if (action === "reload") {
            hub.on(this, (_, { hmr }) => {
                if (hmr) {
                    const [chunk] = this.check(hmr);
                    chunk && doReload();    
                }
            });
        }

        if (typeof action === "function") {
            hub.on(this, (_, { hmr }) => {
                const [chunk, ver] = this.check(hmr);
                chunk && action(chunk, ver!);
            });
        }

        client.port = this.port;
        client.sync();
        
        return true;
    }

    noAction() {
        hub.off(this);
        client.sync();
    }

    freeze() {
        this.noAction();
        term && term.detach(this);
        
        Object.assign(this, { ready: false, state: undefined });
        Object.freeze(this);
    }

    async showLogs() {
        if (Object.isFrozen(this)) {
            return false;
        }

        if (typeof document !== "object") {
            return false;
        }

        if (term === undefined) {
            const { IpcConsole } = await import("../core/IpcConsole");
            if (Object.isFrozen(this) || !IpcConsole.isSupported()) {
                return false;
            }
    
            if (term === undefined) {
                term = IpcConsole.create("rollup-ipc-console-log", ns + "#ipc");
            }
        }

        term.attach(this, hub);

        return true;
    }
}

function hasSameHost(port: string) {
    try {
        if (typeof location === "object") {
            const src = new URL(port);
            const url = new URL(location.href);
            if (url.protocol === "file:") {
                return true;
            }

            if (url.hostname === "localhost") {
                return true;
            }

            if (url.protocol === src.protocol && url.hostname === src.hostname) {
                return true;
            }
        }
    } catch {
        /// don't care
    }

    if (typeof process === "object" && process) {
        const { versions } = process;
        if (typeof versions === "object" && versions && versions.node) {
            return true;
        }
    }

    return false;
}

export function create(id: string, ver: number, hash: string, root: string, self: string, port: string) {
    if (!hasSameHost(port)) {
        return undefined;
    }

    const global = findGlobal();
    const sym = Symbol.for(`${ns}#hmr-context-${id}`);
    const current = global[sym] as ModuleState;
    if (current !== undefined) {
        if (current.ver >= ver) {
            return new ModuleState(false, id, ver, hash, root, self, port);
        }

        const { state } = current;
        current.freeze();

        const next = new ModuleState(true, id, ver, hash, root, self, port, state);
        global[sym] = next;

        return next;
    }

    const next = new ModuleState(true, id, ver, hash, root, self, port);
    global[sym] = next;

    return next;
}
