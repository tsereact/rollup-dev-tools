import { isAbsolute } from "path";
import { GetManualChunkApi, ModuleInfo, PluginContext } from "rollup";
import GlobSet, { GlobInit } from "../core/GlobSet";
import { pathToName } from "../core/ref";

export function ascend(ctx: PluginContext | GetManualChunkApi, list: Iterable<string>, cb: (id: string, info: ModuleInfo) => void) {
    const avoid = new Set<string>();
    const stack: (() => void)[] = [];
    const next = (id: string) => {
        const info = ctx.getModuleInfo(id);      
        if (info && !avoid.has(id)) {
            avoid.add(id);
            stack.push(() => cb(id, info));

            for (const id of info.dynamicImporters) {
                stack.push(() => next(id));
            }

            for (const id of info.importers) {
                stack.push(() => next(id));
            }
        }
    };

    for (const id of list) {
        stack.push(() => next(id));

        let action: (() => void) | undefined;
        while (action = stack.pop()) {
            action();
        }
    }
}

export function descend(ctx: PluginContext | GetManualChunkApi, list: Iterable<string>, cb: (id: string, info: ModuleInfo) => void) {
    const avoid = new Set<string>();
    const stack: (() => void)[] = [];
    const next = (id: string) => {
        const info = ctx.getModuleInfo(id);      
        if (info && !avoid.has(id)) {
            avoid.add(id);
            stack.push(() => cb(id, info));

            for (const id of info.dynamicallyImportedIds) {
                stack.push(() => next(id));
            }

            for (const id of info.importedIds) {
                stack.push(() => next(id));
            }
        }
    };

    for (const id of list) {
        stack.push(() => next(id));

        let action: (() => void) | undefined;
        while (action = stack.pop()) {
            action();
        }
    }
}

export function keep(list: Iterable<string>, ...filters: GlobInit[]) {
    function isSource(id: string) {
        id = pathToName(id);
    
        if (isAbsolute(id) || id[0] === "\0") {
            return false;
        }
    
        return true;
    }

    const filter = GlobSet.create(...filters);
    const result = new Set<string>();
    for (const id of list) {
        if (isSource(id) && filter.match(id)) {
            result.add(id);
        }
    }

    return result;
}

export function intersect(x: Set<string>, y: Set<string>) {
    const result = new Set<string>();
    for (const id of x) {
        y.has(id) && result.add(id);
    }

    return result;
}

export function expand(ctx: PluginContext | GetManualChunkApi, list: Iterable<string>) {
    const queue = new Set(list);
    for (const id of queue) {
        const info = ctx.getModuleInfo(id);
        if (info) {
            for (const id of info.importers) {
                queue.add(id);
            }

            for (const id of info.dynamicImporters) {
                queue.add(id);
            }
        }
    }

    return queue;
}

export function selectTrees(ctx: PluginContext | GetManualChunkApi, list: Iterable<string>, ...filters: GlobInit[]) {
    return expand(ctx, keep(list, ...filters))
}

export function shards(ctx: PluginContext | GetManualChunkApi, list: Iterable<string>) {
    const all = new Set(list);
    const queue = new Set(list);
    const result: Set<string>[] = [];
    for (const id of queue) {
        if (all.delete(id)) { 
            const shard = new Set<string>();
            result.push(shard);
            shard.add(id);

            for (const id of queue) {
                all.delete(id);

                const info = ctx.getModuleInfo(id);
                if (info) {
                    for (const id of info.dynamicallyImportedIds) {
                        shard.add(id);
                    }

                    for (const id of info.importedIds) {
                        shard.add(id);
                    }

                    for (const id of info.dynamicImporters) {
                        shard.add(id);
                    }

                    for (const id of info.importers) {
                        shard.add(id);
                    }
                }
            }
        }
    }

    return result;
}

export function kernel(ctx: PluginContext | GetManualChunkApi) {
    const roots = new Map<string, string>();
    const findRoot = (info: ModuleInfo) => {
        if (info.dynamicImporters.length || info.isEntry) {
            return info.id;
        }

        let first = "";
        for (const id of info.importers) {
            const next = roots.get(id) || "";            
            if (!next || first !== next) {
                return "";
            }            

            first = next;
        }

        return first;
    };

    ascend(ctx, ctx.getModuleIds(), (id, info) => roots.set(id, findRoot(info)));

    const result = new Set<string>();
    for (const [id, root] of roots) {
        if (root === "") {
            result.add(id);
        }
    }

    return result;
}
