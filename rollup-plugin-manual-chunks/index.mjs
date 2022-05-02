import path from 'path';

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
function sizeOf(code) {
    return Buffer.byteLength(code, "utf-8");
}
function slashify(value) {
    return value.replace(/[\\/]+/g, "/");
}
function sourceOf(id) {
    id = path.relative(process.cwd(), id);
    id = path.dirname(id);
    id = slashify(id);
    return id;
}
function vendorOf(id) {
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
function match(id, dir) {
    if (id.startsWith(dir)) {
        id = id.substring(dir.length);
        const [ext, extra] = slashify(id).split("/");
        return extra ? !ext : !path.extname(ext);
    }
    return false;
}
class NameSet extends Map {
    constructor() {
        super(...arguments);
        this.last = "";
    }
    add(name) {
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
let silent = false;
function manualChunks(prefix, dirs) {
    const seeds = [];
    const names = new NameSet();
    for (const key in dirs) {
        seeds.push([path.resolve(prefix, key), names.add(dirs[key]), new Set()]);
    }
    const chunks = new Map();
    const mapped = new Set();
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
            for (const [, , queue] of seeds) {
                queue.clear();
            }
            for (const id of this.getModuleIds()) {
                for (const [dir, , queue] of seeds) {
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
            const queue = new Set();
            for (const id of this.getModuleIds()) {
                const info = this.getModuleInfo(id);
                if (info && info.isEntry) {
                    queue.add(id);
                }
            }
            const vendors = new Set();
            for (const id of queue) {
                const info = this.getModuleInfo(id);
                if (info) {
                    for (const id of info.dynamicallyImportedIds) {
                        const vendor = vendorOf(id);
                        if (vendor) {
                            vendors.add(vendor);
                        }
                        else {
                            queue.add(id);
                        }
                    }
                    for (const id of info.importedIds) {
                        const vendor = vendorOf(id);
                        if (vendor) {
                            vendors.add(vendor);
                        }
                        else {
                            queue.add(id);
                        }
                    }
                }
            }
            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk") {
                    const parts = new Set();
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
                        console.log("Chunk: %s, %s, %s", chunk.name, key, sizeOf(chunk.code));
                        for (const part of [...parts].sort()) {
                            console.log("    ", part);
                        }
                    }
                }
            }
        },
    };
}
(function (manualChunks) {
    function suppressOutput() {
        silent = true;
    }
    manualChunks.suppressOutput = suppressOutput;
})(manualChunks || (manualChunks = {}));
var manualChunks$1 = manualChunks;

export { manualChunks$1 as default };
//# sourceMappingURL=index.mjs.map