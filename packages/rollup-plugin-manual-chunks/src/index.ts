/*
    Allows for intelligent chunk generation.

    Most users of rollup will hand pick what should go into each chunk. This
    can be difficult to get right if you have a non-trivial stack. One can
    also accidentally introduce a load cycle among the generated chunks. In
    this way, we should achieve better results more easily.

    This plugin will carve out module subgraphs into chunks. The plugin
    takes a { dir => chunk } map which informs this process. The order
    of the entries in the map is relevant. The chunk assignment of a
    module is chosen based on this order (earlier means more important).

    Considerations when ordering:
        - Environment: common vs browser vs node
        - Usage: most vs least
        - Boot: early vs late

    NOTE: Modules are never assigned a chunk if
    directly imported using a dynamic import
    statement. import(...) statements are almost
    always done with good reason.

    NOTE: Rollup does a pretty good job by itself
    when there is only one entry point and one
    environment.
*/

import type { Plugin } from "rollup";
import path from "path";

let silent = false;
const cwd = path.normalize(path.resolve() + "/");

function sizeOf(code: string) {
    return Buffer.byteLength(code, "utf-8");
}

function slashify(value: string) {
    return value.replace(/[\\/]+/g, "/");
}

function sourceOf(id: string) {
    id = path.relative(process.cwd(), id);
    id = path.dirname(id);
    id = slashify(id);

    return id;
}

function vendorOf(id: string) {
    if (id[0] === "\0") {
        return false;
    }

    id = slashify(id);
    
    const [, suffix] = id.split("/node_modules/");
    if (suffix) {
        const [scope, name] = suffix.split("/");
        if (scope && scope[0] !== "@") {
            return scope;
        }

        if (name) {
            return `${scope}/${name}`;
        }
    }

    return false;
}

function resolve(id: string) {
    if (id[0] === "\0") {
        return false;
    }

    if (id.startsWith("npm:")) {
        return id;
    }

    if (id.startsWith("src:")) {
        return id;
    }

    const vendor = vendorOf(id);
    if (vendor) {
        return `npm:${vendor}`;
    }

    id = path.normalize(path.resolve(id));

    if (id.startsWith(cwd)) {
        id = id.substring(cwd.length);
        id = slashify(id);        

        return `src:${id}`;
    }

    return false;
}

function match(id: string | false, dir: string | false) {
    if (!id || !dir) {
        return false;
    }

    id = resolve(id);

    if (!id) {
        return false;
    }

    if (id === dir) {
        return true;
    }

    if (dir === "npm:") {
        return id.startsWith("npm:");
    }

    if (dir.startsWith("mpm:")) {
        return id === dir;
    }

    if (dir === "src:") {
        return id.startsWith("src:");
    }

    if (dir.startsWith("src:") && id.startsWith(dir)) {
        id = id.substring(dir.length);

        const [first] = id.split("/");
        if (first === "") {
            return true;
        }

        const [head, type, tail] = id.split(".");
        return head === "" && type && tail === undefined;
    }

    return false;
}

class NameSet extends Map<string, string> {
    last = "";

    add(name: string) {
        if (this.get(this.last) === name) {
            return this.last;
        }

        let i = 2;
        let next = name;
        while (this.has(next)) {
            next = `${name}${i++}`;
        }
        
        this.set(this.last = next, name);
        return next;
    }
}

function manualChunks(dirs: Record<string, string>): Plugin {
    type Seed = [dir: string | false, name: string, queue: Set<string>];

    const seeds = [] as Seed[];
    const names = new NameSet();
    for (const key in dirs) {
        seeds.push([resolve(key), names.add(dirs[key]), new Set()]);
    }

    const chunks = new Map<string, string | false>();
    const mapped = new Set<string>();
    return {
        name: "manual-chunks",

        outputOptions(opts) {
            const { manualChunks } = opts;
            opts.manualChunks = function (id, api) {
                if (typeof manualChunks === "function") {
                    const result = manualChunks.call(this, id, api);
                    if (typeof result === "string" || result === null) {
                        return result;
                    }
                }

                const result = chunks.get(id);
                if (result !== undefined) {
                    id[0] !== "\0" && mapped.add(id);
                    return result !== false ? result : null;
                }

                return undefined;
            };            
        },

        renderStart() {
            chunks.clear();
            mapped.clear();
            
            for (const [,, queue] of seeds) {
                queue.clear();
            }

            for (const id of this.getModuleIds()) {                
                for (const [dir,, queue] of seeds) {
                    if (match(id, dir)) {
                        queue.add(id);
                        break; 
                    }
                }
            }

            // crawl down each module sub-graph and mark the modules as chunks thusly
            for (const [, chunk, queue] of seeds) {
                for (const id of queue) {
                    if (!chunks.has(id)) {
                        const info = this.getModuleInfo(id);
                        if (info && !info.isExternal) {
                            chunks.set(id, info.isEntry || info.dynamicImporters.length ? false : chunk);

                            for (const id of info.dynamicallyImportedIds) {
                                queue.add(id);
                            }
            
                            for (const id of info.importedIds) {
                                queue.add(id);
                            }
                        }
                    }
                }
            }
        },

        writeBundle(_, bundle) {
            if (silent) {
                return;
            }

            // Of the source modules, find our vendors.
            const queue = new Set<string>();
            for (const id of this.getModuleIds()) {
                const info = this.getModuleInfo(id);
                if (info && info.isEntry) {
                    queue.add(id);
                }
            }

            const vendors = new Set<string>();
            for (const id of queue) {
                const info = this.getModuleInfo(id);
                const vendor = vendorOf(id);
                if (info && !vendor) {
                    for (const id of info.dynamicallyImportedIds) {
                        queue.add(id);
                    }
    
                    for (const id of info.importedIds) {
                        queue.add(id);
                    }
                }

                if (vendor) {
                    vendors.add(vendor);
                }
            }

            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk") {
                    const parts = new Set<string>();
                    for (const id in chunk.modules) {
                        if (mapped.has(id)) {
                            const vendor = vendorOf(id);
                            if (vendor && vendors.has(vendor)) {
                                parts.add("vendor: " + vendor);
                            }

                            if (!vendor) {
                                parts.add("source: " + sourceOf(id));
                            }
                        }
                    }

                    if (parts.size > 0) {
                        console.log("Chunk: %s, %s, %s", chunk.name, key, sizeOf(chunk.code))

                        for (const part of [...parts].sort()) {
                            console.log("    ", part);
                        }
                    }
                }
            }
        },
    };
}

namespace manualChunks {
    export function suppressOutput() {
        silent = true;
    }
}

export default manualChunks;