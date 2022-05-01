/*
    Allows for really fast watch mode.

    The basic idea is to prebuild the node modules into
    a set of chunks that we cache. These chunks are
    injected back into the generated code as references.
    
    This means that only the app code compiles each pass,
    so other plugins that reparse and transform code
    do not have to be included in the plugin list.
*/

import type { Plugin } from "rollup";

import { spawn } from "child_process";

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

function slashify(path: string) {
    return path.replace(/[\\/]+/g, "/");
}

function relative(from: string, to: string) {
    return slashify(path.relative(from, to));
}

function vendorOf(id: string) {
    id = slashify(id);
    
    const [, suffix] = id.split("/node_modules/");
    if (suffix) {
        const [scope, name] = suffix.split("/");
        if (scope && name) {
            if (scope[0] === "@") {
                return `${scope}/${name}`;
            }
        
            return scope;
        }
    }

    return false;
}

async function sync(dir: string, cache: Map<string, [string, string]>) {
    cache.clear();

    try {
        const fn = path.resolve(dir || ".", "prebuilt.json");
        const content = await fs.readFile(fn, "utf-8");
        const entires = JSON.parse(content);
        for (const [key, value] of Object.entries(entires)) {
            cache.set(key, value as [string, string]);
        }
    } catch {
        // don't care
    }
}

function hashIt(cache: Map<string, [string, string]>) {
    const items = [];
    const keys = [...cache.keys()].sort();
    for (const key of keys) {
        items.push(key, cache.get(key));
    }

    const hasher = crypto.createHash("sha256");
    hasher.update(JSON.stringify(items));
    return hasher.digest("hex");
}

class AliasTable extends Map<any, string> {
    add(id: any) {
        let value = this.get(id);
        if (value === undefined) {
            value = `?x-linker${this.size}`;
            this.set(id, value);
        }

        return value;
    }
}

class NameTable extends Map<string, string> {
    add(id: string) {
        let value = this.get(id);
        if (value === undefined) {
            value = `__prebuilt$$${this.size}`;
            this.set(id, value);
        }

        return value;
    }
}

const empty: undefined[] = [];
const xlinker = /^\0(.*)\?x-linker$/;

export function linker(dir: string, cmd: string): Plugin {
    dir = path.resolve(dir);

    let sig = "";
    const aliases = new AliasTable();
    const cache = new Map<string, [string, string]>();
    const names = new NameTable();
    return {
        name: "linker",

        async resolveId(id, importer, opts) {
            // Make sure a special modules resolve.
            if (xlinker.test(id)) {
                return { id, syntheticNamedExports: "__exports" };
            }

            // Whenever our code reaches into their code, intercept that with a placeholder.
            const result = await this.resolve(id, importer, { ...opts, skipSelf: true });
            if (result && !result.external && vendorOf(result.id)) {
                const suffix = aliases.add(importer);
                const id = `\0${result.id}${suffix}`;
                return { id, syntheticNamedExports: "__exports" };
            }

            return result;
        },

        load(id) {
            // Create a placeholder that we plan to satisfy later.
            if (xlinker.test(id)) {
                const name = names.add(id);
                return `export const __exports = ${name};`;
            }

            return undefined;
        },

        async renderStart(opts) {
            await sync(dir, cache);

            let prebuild = false;
            const request = new Set(cache.keys());
            for (const id of this.getModuleIds()) {
                const [, ref] = id.match(xlinker) || empty;
                if (ref && !cache.get(ref)) {
                    prebuild = true;
                    request.add(ref);
                }
            }

            if (prebuild) {
                const inputs = [...request];
                const vendors = new Set(inputs.map(vendorOf));
                console.log("Building vendor modules:", ...vendors);

                const dir = path.resolve(opts.dir || ".");
                await fs.mkdir(dir, { recursive: true });

                const fn = path.join(dir, "linker.json");
                const links = inputs.map(x => relative(dir, x));
                await fs.writeFile(fn, JSON.stringify(links, undefined, 4));
                
                const child = spawn(cmd, {
                    stdio: "inherit",
                    shell: true,
                });

                const code = await new Promise((resolve, reject) => {
                    child.on("exit", resolve);
                    child.on("error", reject);
                });

                if (code) {
                    console.warn("Pre-build result has errors.");
                }
                
                await sync(dir, cache);
            }

            sig = hashIt(cache);
        },

        augmentChunkHash() {
            return sig;
        },

        generateBundle(opts, bundle) {
            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk") {
                    const lines = [];
                    for (const id in chunk.modules) {
                        const [, ref] = id.match(xlinker) || empty;
                        if (ref) {
                            let binding = "";
                            let fn = ref;
                            const name = names.add(id);
                            const entry = cache.get(ref);
                            if (entry !== undefined) {
                                binding = `{ ${entry[1]} as ${name} }`;
                                fn = path.resolve(dir, binding[0]);
                            }

                            if (!binding) {
                                binding = `* as ${name}`;
                            }

                            const base = path.resolve(opts.dir || ".", key);
                            fn = relative(path.dirname(base), fn);

                            if (entry === undefined) {
                                console.warn("Can't find pre-built:", fn);
                            }

                            lines.push(`import ${binding} from ${JSON.stringify(fn)}`);
                        }
                    }

                    if (lines.length > 0) {
                        const { map } = chunk;
                        if (map) {
                            // Adjust source maps because we are injecting code.
                            const prefix = ";".repeat(lines.length);
                            map.mappings = `${prefix}${map.mappings}`;
                        }

                        lines.push(chunk.code);
                        chunk.code = lines.join("\n");
                    }
                }
            }
        }
    };
}

export default linker;
