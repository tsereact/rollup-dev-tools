import type { Plugin } from "rollup";
import { builtinModules } from "module";
import { createHash } from "crypto";

const empty: undefined[] = [];
const interopx = /^\0(.*)\?x-interop-[a-f0-9]+$/;
const builtins = new Set([
    ...builtinModules,
    ...builtinModules.map(x => "node:" + x),
]);

function hashIt(value: string) {
    const hasher = createHash("sha256");
    hasher.update(value);
    return hasher.digest("hex");
}

function wrap(require: any, ref: string) {
    const result = require(ref);
    if (result.__esModule || result.default !== undefined) {
        return result;
    }

    const module = Object.create(result);
    module.__esModule = !0;
    module.default = module;

    return module;
}

function test(id: string) {
    if (builtins.has(id)) {
        return true;
    }

    if (id === "electron") {
        return true;
    }

    if (id.startsWith("electron/")) {
        return true;
    }

    return false;
}

interface Filter {
    (id: string, importer?: string): boolean;
}

/**
 * Wraps imports of externals with a preference to use require.
 * @param filter Additional externals to consider.
 * @description Electron and some other environments can't import
 * node's built-in modules directly with ES6 import directivess. We 
 * have to escape out to using require in this circumstance.
 */
function interop(filter?: string[] | Filter): Plugin {
    const match = (id: string, importer?: string) => {
        if (Array.isArray(filter) && filter.indexOf(id) >= 0) {
            return true;
        }

        if (typeof filter === "function" && filter(id, importer)) {
            return true;
        }

        if (test(id)) {
            return true;
        }

        return false;
    };

    return {
        name: "interop",

        resolveId(id, importer) {
            if (interopx.test(id)) {
                return { id, syntheticNamedExports: "exports" };
            }

            if (match(id, importer)) {
                const hash = hashIt(importer || "");
                return { id: `\0${id}?x-interop-${hash}`, syntheticNamedExports: "exports" };
            }

            return undefined;
        },

        load(id) {
            const [, ref] = id.match(interopx) || empty;
            if (ref) {
                const code = [
                    wrap.toString(),
                    `const ref = ${JSON.stringify(ref)};`,
                    `export const exports = typeof require === "function" ? wrap(require, ref) : await import(ref);`,
                ];

                return code.join("\n");
            }

            return undefined;
        }
    };
}

export default interop;
