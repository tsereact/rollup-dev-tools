import { GetManualChunkApi, ModuleInfo, PluginContext } from "rollup";

interface Walker {
    (id: string, info: ModuleInfo, list?: readonly string[]): readonly string[] | void | undefined;
}

export function walk(ctx: PluginContext | GetManualChunkApi, list: Iterable<string>, cb: Walker) {
    const avoid = new Set<string>();
    const stack: (() => void)[] = [];
    const next = (id: string) => {
        const info = ctx.getModuleInfo(id);      
        if (info && !avoid.has(id)) {
            avoid.add(id);

            const list = cb(id, info);
            if (list) {
                stack.push(() => cb(id, info, list));
            
                for (const id of list) {
                    stack.push(() => next(id));
                }
            }
        }
    };

    for (const id of list) {
        next(id);

        let action: (() => void) | undefined;
        while (action = stack.pop()) {
            action();
        }
    }
}
