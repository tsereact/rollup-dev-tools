import type { Plugin } from "rollup";

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";

import crypto from "crypto";

function slashify(value: string) {
    return value.replace(/[\\/]+/g, "/");
}

function isSource(id: string) {
    if (id[0] === "\0") {
        return false;
    }

    id = slashify(id);

    if (id.indexOf("/node_modules/") < 0) {
        return false;
    }

    return true;
}

function hashIt(facet: string, id: string) {
    const hasher = crypto.createHash("sha256");
    hasher.update(facet);
    hasher.update("\n");
    hasher.update(id);
    
    return hasher.digest("hex");
}

const empty = [] as undefined[];
const hmrx = /^\0(.*)?x-hmr-([a-f0-9]+)$/;

interface HotInfo extends Record<string, [chunk: string, gen: number]> {

}

function hmr(facet = "main", refId = "", moduleId = ""): Plugin {
    let gen = 0;
    let hot: HotInfo = {};
    const states = new Map<string, [string, number]>();
    return {
        name: "hmr",

        async buildStart() {
            hot = {}; 
            gen = (new Date()).valueOf();

            if (!refId || !moduleId) {
                let last: any;
                let url = new URL("./package.json", import.meta.url);
                while (url.toString() !== last) {
                    try {
                        const fn = fileURLToPath(url);
                        const json = await readFile(fn, "utf-8");
                        last = true;

                        const { hmr } = JSON.parse(json);
                        if (typeof hmr === "object") {
                            const { ref, module } = hmr;
                            if (!refId && typeof ref === "string") {
                                refId = ref;
                            }

                            if (!moduleId && typeof module === "string") {
                                moduleId = module;
                            }
                        }
                    } catch {
                        // don't care
                    }

                    if (last === true) {
                        break;
                    }

                    last = url.toString();
                    url = new URL("../package.json", url);
                }
            }
        
            if (!refId) {
                refId = "@tsereact/webdock/hmr-state";
            }
        
            if (!moduleId) {
                moduleId = "@tsereact/webdock/hmr-context";
            }
        },

        async resolveId(id, importer, opts) {
            if (hmrx.test(id)) {
                return id;
            }

            if (id === refId && importer && !isSource(importer)) {
                const result = await this.resolve(moduleId, importer, { ...opts, skipSelf: true });
                if (result && !result.external) {
                    const hash = hashIt(facet, importer || "");
                    return `\0${result.id}?x-hmr-${hash}`;
                }

                return result;
            }

            return undefined;
        },

        load(id) {
            const [, ref, hash] = id.match(hmrx) || empty;
            if (ref && hash) {
                const code = [
                    `import { create } from ${JSON.stringify(ref)};\n`,
                    `export * from ${JSON.stringify(ref)};\n`,
                    `export default create(${JSON.stringify(hash)}, import.meta.hmrVersion, import.meta.hmrSelf);\n`,
                ];

                return code.join("");
            }

            return undefined;
        },

        async buildEnd() {
            states.clear();

            for (const id of this.getModuleIds()) {
                if (isSource(id)) {
                    const info = this.getModuleInfo(id);
                    if (info) {
                        const next = hashIt(facet, info.code || "");
                        const [hash] = states.get(id) || empty;
                        if (next !== hash) {
                            states.set(id, [next, gen]);
                        }
                    }
                }
            }
        },

        augmentChunkHash(chunk) {
            const result = [] as any[];
            for (const id of Object.keys(chunk.modules).sort()) {
                const info = this.getModuleInfo(id);
                if (info) {
                    const [hash, ver] = states.get(id) || empty;
                    result.push(id, hash || "", ver || 0);
                }
            }

            return JSON.stringify(result);
        },

        resolveImportMeta(prop, { chunkId }) {
            if (prop === "hmrSelf") {
                return JSON.stringify(chunkId);
            }

            if (prop === "hmrVersion") {
                return JSON.stringify(gen);
            }

            return undefined;
        },

        writeBundle(_, bundle) {
            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk") {
                    for (const id in chunk.modules) {
                        const info = this.getModuleInfo(id);
                        if (info) {
                            for (const id of info.dynamicallyImportedIds) {
                                const [,, hash] = id.match(hmrx) || empty;
                                if (hash) {
                                    hot[id] = [key, gen];
                                }
                            }

                            for (const id of info.importedIds) {
                                const [,, hash] = id.match(hmrx) || empty;
                                if (hash) {
                                    hot[id] = [key, gen];
                                }
                            }
                        }
                    }
                }
            }
        },

        closeBundle() {
            // final.forEach(client.request);
        }
    };
}

export default hmr;