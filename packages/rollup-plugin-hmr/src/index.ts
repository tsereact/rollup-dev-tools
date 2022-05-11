import type { Plugin } from "rollup";

import { readFile, stat } from "fs/promises";
import { fileURLToPath } from "url";

import crypto from "crypto";
import server from "./ipc/server";

const empty = [] as undefined[];
const hmrx = /^\0(.*)?x-hmr-([a-f0-9]+)$/;

function slashify(value: string) {
    return value.replace(/[\\/]+/g, "/");
}

function isSource(id: string) {
    if (id[0] === "\0") {
        return false;
    }

    id = slashify(id);

    if (id.indexOf("/node_modules/") >= 0) {
        return false;
    }

    return true;
}

async function mtimeOf(id: string) {
    try {
        const { mtimeNs } = await stat(id, { bigint: true });
        return String(mtimeNs);    
    } catch {
        // don't care
    }

    return "";
}

function hashIt(facet: string, id: string) {
    const hasher = crypto.createHash("sha256");
    hasher.update(facet);
    hasher.update("\n");
    hasher.update(id);
    
    return hasher.digest("hex");
}

function hmr(facet = "main", refId = "", moduleId = ""): Plugin | false {
    if (process.env.ROLLUP_WATCH !== "true") {
        return false;
    }

    let gen = 0;
    let ticket = {};
    let port = "";
    let mtimes = {} as Record<string, string | Promise<string>>;
    return {
        name: "hmr",

        async buildStart() {
            if (!refId || !moduleId) {
                let last: any;
                let url = new URL("./package.json", import.meta.url);
                while (url.toString() !== last) {
                    try {
                        const fn = fileURLToPath(url);
                        const json = await readFile(fn, "utf-8");
                        last = true;

                        const { name, hmr } = JSON.parse(json);
                        if (typeof hmr === "object") {
                            const { ref, module } = hmr;
                            if (!refId && typeof ref === "string") {
                                refId = ref;
                            }

                            if (!moduleId && typeof module === "string") {
                                moduleId = module;
                            }
                        }

                        if (name === "@tsereact/rollup-plugin-hmr") {
                            if (!refId) {
                                refId = `${name}/state`;
                            }
                        
                            if (!moduleId) {
                                moduleId = `${name}/context`;
                            }
                        }

                        if (name === "@tsereact/rollup-dev-tools") {
                            if (!refId) {
                                refId = `${name}/plugin-hmr/state`;
                            }
                        
                            if (!moduleId) {
                                moduleId = `${name}/plugin-hmr/context`;
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
                refId = "hmr/state";
            }
        
            if (!moduleId) {
                moduleId = "hmr/context";
            }
        },

        async resolveId(id, importer, opts) {
            if (hmrx.test(id)) {
                return id;
            }

            if (id === refId && importer && isSource(importer)) {
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
                const args = [
                    JSON.stringify(hash),
                    "import.meta.hmrVersion",
                    "import.meta.hmrSelf",
                    "import.meta.hmrPort",
                ];

                const argsStr = args.join(", ");
                const code = [
                    `import { create } from ${JSON.stringify(ref)};\n`,
                    `export default create(${argsStr});\n`,
                ];

                return code.join("");
            }

            return undefined;
        },

        async buildEnd() {
            gen = (new Date()).valueOf();
            ticket = {};
            port = await server.listen();
            mtimes = {};

            for (const id of this.getModuleIds()) {
                if (isSource(id)) {
                    mtimes[id] = mtimeOf(id);
                }
            }

            for (const id in mtimes) {
                mtimes[id] = await mtimes[id];
            }
        },

        augmentChunkHash(chunk) {
            const result = [] as any[];
            for (const id of Object.keys(chunk.modules).sort()) {
                const mtime = mtimes[id];
                if (mtime && typeof mtime === "string") {
                    result.push(id, mtime);
                }
            }

            if (result.length) {
                return JSON.stringify(result);    
            }

            return undefined;
        },

        resolveImportMeta(prop, { chunkId }) {
            if (prop === "hmrPort") {
                return JSON.stringify(port);
            }

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
                                hash && server.update(ticket, hash, key, gen);
                            }

                            for (const id of info.importedIds) {
                                const [,, hash] = id.match(hmrx) || empty;
                                hash && server.update(ticket, hash, key, gen);
                            }
                        }
                    }
                }
            }
        },

        closeBundle() {
            server.commit(ticket);
        }
    };
}

namespace hmr {
    export function listen(port = 7180, host = "localhost") {
        if (process.env.ROLLUP_WATCH !== "true") {
            return server.listen(port, host);
        }

        return Promise.resolve("");
    }
}

export default hmr;