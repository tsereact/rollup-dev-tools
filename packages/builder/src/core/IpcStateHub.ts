import type IpcSocket from "./IpcSocket";

export interface Handler {
    (id: any, state: any): any;
}

export class IpcStateHub {
    private handlers = new Map<any, Handler>();
    private states = new Map<any, any>();

    private broadcast(id: any, state: any) {
        const { handlers, states } = this;
        handlers.forEach(async (handler, ticket) => {
            await (0 as any);
            if (handlers.get(ticket) === handler && states.get(id) === state) {
                handler(id, state || false);
            }
        });
    }

    any() {
        const { handlers, states } = this;
        return !!handlers.size || !!states.size;
    }

    off(ticket: any) {
        this.handlers.delete(ticket)
    }

    on(ticket: any, handler: Handler) {
        const { handlers, states } = this;
        if (handlers.get(ticket) === handler) {
            return false;
        }

        handlers.set(ticket, handler);

        states.forEach(async (state, id) => {
            await (0 as any);
            if (handlers.get(ticket) === handler && states.get(id) === state) {
                handler(id, state);
            }
        });

        return true;
    }

    set(id: any, state: any) {
        const { states } = this;
        if (state) {
            if (states.get(id) === state) {
                return true;
            }

            states.set(id, state);
            this.broadcast(id, state);
            
            return true;
        }

        if (states.delete(id)) {
            this.broadcast(id, undefined);
        }

        return false;
    }

    clear(filter: (id: any, state: any) => boolean) {
        const set = new Set<any>();
        const { states } = this;
        for (const [id, state] of states) {
            if (filter(id, state)) {
                set.add(id);
            }
        }

        for (const id of set) {
            states.delete(id);
            this.broadcast(id, false);
        }
    }

    async sync(ipc: IpcSocket, filter?: (state: any) => any) {
        const sym = {};
        const handles = new Map<any, any>();
        ipc.on(sym, (type, data) => {
            if (type === "message" && Array.isArray(data)) {
                const [key, state] = data;
                let id = handles.get(key);
                if (state) {
                    handles.set(key, id || (id = [sym]));
                    this.set(id, state);
                } else if (handles.delete(key)) {
                    this.set(id, false);
                }
            }
        });

        let next = 1;
        const keys = new Map<any, number>();
        this.on(sym, (id: any, state: any) => {
            if (!Array.isArray(id) || id[0] !== sym) {
                if (filter) {
                    state = filter(state);
                }

                let key = keys.get(id);
                if (state) {
                    keys.set(id, key || (key = next++));
                    ipc.send("message", [key, state]);
                } else if (keys.delete(id)) {
                    ipc.send("message", [key, false]);
                }
            }
        });

        await ipc.wait();

        this.off(sym);
        this.clear(id => Array.isArray(id) && id[0] === sym);
    }

    toJSON() {
        return [...this.states.values()];
    }
}

export default IpcStateHub;
