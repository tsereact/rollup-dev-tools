import type { Plugin } from "rollup";

import { isAbsolute } from "path";
import { builtinModules } from "module";

const none = {};
const defs = new Set([
    ...builtinModules,
    ...builtinModules.map(x => "node:" + x),
]);

function vendorOf(id: string) {
    if (id[0] === "\0") {
        return none;
    }

    if (isAbsolute(id)) {
        return none;
    }

    if (id.startsWith("./") || id.startsWith("../")) {
        return none;
    }

    const [scope, name] = id.split("/");
    if (scope && scope[0] !== "@") {
        return scope;
    }

    if (name) {
        return `${scope}/${name}`;
    }

    return none;
}

function nodeExternals(list?: Record<string, boolean> | string[]): Plugin {
    const refs = new Set<any>(defs);
    if (Array.isArray(list)) {
        for (const key of list) {
            refs.add(key);
        }
    }

    if (list && !Array.isArray(list)) {
        for (const key in list) {
            if (list[key]) {
                refs.add(key);
            } else {
                refs.delete(key);
            }
        }
    }

    return {
        name: "node-externals",

        resolveId(id) {
            if (refs.has(vendorOf(id))) {
                return { id, external: true };
            }

            return undefined;
        }
    };
}

export default nodeExternals;
