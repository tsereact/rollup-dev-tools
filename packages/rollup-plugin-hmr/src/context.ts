function createGlobalStates(): Map<string, ModuleState> {
    const global = (new Function("return this"))();
    const sym = Symbol.for("https://github.com/tsereact/rollup-dev-tools#hmr");
    const map = global[sym];
    if (map !== undefined) {
        return map;
    }

    return global[sym] = new Map();
}

const states = createGlobalStates();

export class ModuleState {
    readonly ready: boolean;
    state: any;
    ver: number;
    self: string;

    constructor(ready = true, state: any, ver: number, self: string) {
        this.ready = ready;
        this.state = state;
        this.ver = ver;
        this.self = self;
    }
}

export function create(id: string, ver: number, self: string) {
    const current = states.get(id);
    if (current !== undefined) {
        if (current.ver >= ver) {
            return new ModuleState(false, undefined, ver, self);
        }

        const next = new ModuleState(true, current.state, ver, self);
        states.set(id, next);

        return next;
    }

    const next = new ModuleState(true, undefined, ver, self);
    states.set(id, next);

    return next;
}
