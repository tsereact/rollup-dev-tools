import client from "./ipc/client";

function createGlobalStates(): Map<string, ModuleState> {
    const global = (new Function("return this"))();
    const sym = Symbol.for("https://github.com/tsereact/rollup-dev-tools#hmr");
    const map = global[sym];
    if (map !== undefined) {
        return map;
    }

    return global[sym] = new Map();
}

function doImport(self: string, next: string, tag: number) {
    self = self.replace(/[^\\/]+/g, "..");
    self = self.replace(/[^\\/]+$/, "");

    const baseUrl = new URL("./" + self, import.meta.url);
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
    readonly self: string;
    readonly port: string;

    state: any;

    constructor(id: string, ready: boolean, ver: number, hash: string, self: string, port: string, state?: any) {
        this.id = id;
        this.ready = ready;
        this.ver = ver;
        this.hash = hash;
        this.self = self;
        this.port = port;

        this.state = state;

        if (!this.ready) {
            this.freeze();
        }
    }

    onUpdate(action: Action) {
        if (Object.isFrozen(this)) {
            return false;
        }

        if (action === "import") {
            const entry = client.on(this, action, () => {
                const [chunk, ver] = client.check(entry, this.id, this.ver, this.hash);
                chunk && doImport(this.self, chunk, ver!);
            });
        }

        if (action === "reload") {
            const entry = client.on(this, action, () => {
                const [chunk] = client.check(entry, this.id, this.ver, this.hash);
                chunk && doReload();
            });
        }

        if (typeof action === "function") {
            const entry = client.on(this, "", () => {
                const [chunk, ver] = client.check(entry, this.id, this.ver, this.hash);
                chunk && action(chunk, ver!);
            });
        }

        client.setup(this.port);
        return true;
    }

    noAction() {
        client.off(this);
    }

    freeze() {
        client.off(this);
        Object.assign(this, { ready: false, state: undefined });
        Object.freeze(this);
    }
}

function hasSameHost(port: string) {
    try {
        const url = new URL(location.href);
        const src = new URL(port);
        return url.hostname === src.hostname;
    } catch {
        /// don't care
    }

    return false;
}

export function create(id: string, ver: number, hash: string, self: string, port: string) {
    if (!hasSameHost(port)) {
        return undefined;
    }

    const states = createGlobalStates();
    const current = states.get(id);
    if (current !== undefined) {
        if (current.ver >= ver) {
            return new ModuleState(id, false, ver, hash, self, port);
        }

        const { state } = current;
        current.freeze();

        const next = new ModuleState(id, true, ver, hash, self, port, state);
        states.set(id, next);

        return next;
    }

    const next = new ModuleState(id, true, ver, hash, self, port);
    states.set(id, next);

    return next;
}
