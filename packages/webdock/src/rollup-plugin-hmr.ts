import type { Plugin } from "rollup";
import type { HMR } from "./ipc/Message";
import { pathToFileURL } from "url";

import crypto from "crypto";
import client from "./ipc/client";

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

function hashIt(facet: string, id: string) {
    const hasher = crypto.createHash("sha256");
    hasher.update(facet);
    hasher.update("\n");
    hasher.update(id);
    
    return hasher.digest("hex");
}

const empty = [] as undefined[];
const hmrx = /^\0(.*)?x-hmr-([a-f0-9]+)$/;

function hmr(facet = "main", refId = "", moduleId = ""): Plugin {
    if (!refId || !moduleId) {
        const fn = pathToFileURL(import.meta.url);
        const vendor = vendorOf(fn.toString());
        if (vendor === "@tsereact/rollup-dev-tools") {
            if (!refId) {
                refId = `${vendor}/webdock/hmr`;
            }

            if (!moduleId) {
                moduleId = `${vendor}/webdock/hmr-context`;
            }
        }
    }

    if (!refId) {
        refId = "@tsereact/webdock/hmr";
    }

    if (!moduleId) {
        moduleId = "@tsereact/webdock/hmr";
    }

    let gen = 0;
    const final = [] as HMR.Publish[];
    const states = new Map<string, [string, number]>();
    return {
        name: "hmr",

        buildStart() {
            final.length = 0;
            gen = (new Date()).valueOf();
        },

        async resolveId(id, importer, opts) {
            if (hmrx.test(id)) {
                return id;
            }

            if (id === refId) {
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
                                    final.push({ channel: "hmr-publish", id: hash, chunk: key, gen });
                                }
                            }

                            for (const id of info.importedIds) {
                                const [,, hash] = id.match(hmrx) || empty;
                                if (hash) {
                                    final.push({ channel: "hmr-publish", id: hash, chunk: key, gen });
                                }
                            }
                        }
                    }
                }
            }
        },

        closeBundle() {
            final.forEach(client.request);
        }
    };
}

export default hmr;