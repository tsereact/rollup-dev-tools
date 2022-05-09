import type { Plugin } from "rollup";
import fs from "fs/promises";
import path from "path";

const empty: undefined[] = [];
const xprimer = /^\0(.*)\?x-primer$/;

function slashify(path: string) {
    return path.replace(/[\\/]+/g, "/");
}

function relative(from: string, to: string) {
    return slashify(path.relative(from, to));
}

function only(modules: Record<string, any>, id: string) {
    let result = false;
    for (const key in modules) {
        if (key !== id) {
            return false;
        } else {
            result = true;
        }
    }

    return result;
}

function primer(dir: string): Plugin {
    dir = path.resolve(dir);

    return {
        name: "prebuild-primer",

        async buildStart() {
            // Read the requested modules to build, and
            // emit them as special entry points.
            const fn = path.join(dir, "linker.json");
            const content = await fs.readFile(fn, "utf-8");
            for (const rel of JSON.parse(content)) {
                const ref = path.resolve(dir, rel);
                this.emitFile({
                    type: "chunk",
                    id: `\0${ref}?x-primer`,
                })
            }
        },

        resolveId(id) {
            // Make sure our special entry points resolve.
            if (xprimer.test(id)) {
                return id;
            }

            return undefined;
        },

        load(id) {
            // Re-export everything as __exports for this is the contract
            // we are trying to fulfill.
            const [, ref] = id.match(xprimer) || empty;
            if (ref) {
                return `import * as __exports from ${JSON.stringify(ref)}; export { __exports };`;
            }

            return undefined;
        },

        generateBundle(opts, bundle) {
            const remove: string[] = [];
            const result: Record<string, [string, string]> = {};
            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk" && chunk.facadeModuleId) {
                    const id = chunk.facadeModuleId;
                    const [, ref] = id.match(xprimer) || empty;
                    if (ref) {
                        let fn = key;
                        let binding = "__exports";
                        if (only(chunk.modules, id)) {
                            remove.push(key);
                            
                            // We can reduce the number of output assets
                            const { imports, importedBindings } = chunk;
                            fn = imports[0];
                            binding = importedBindings[fn][0];
                        }

                        fn = path.resolve(opts.dir || ".", fn);
                        fn = relative(dir, fn);

                        result[relative(dir, ref)] = [fn, binding];
                    }
                }
            }

            for (const key of remove) {
                delete bundle[key];
            }

            this.emitFile({
                type: "asset",
                fileName: "primer.json",
                source: JSON.stringify(result, undefined, 4),
            });
        }
    };
}

export default primer;
