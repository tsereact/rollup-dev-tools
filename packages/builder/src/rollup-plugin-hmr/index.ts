import type { Plugin } from "rollup";

import { commit, start } from "../core/ipcMain";
import { walk } from "../rollup-tools/walk";
import { isAbsolute, relative, resolve } from "path";
import { hashIt, slashify, tag } from "../core/ref";
import { stat } from "fs/promises";
import { isWatchMode } from "../core/modes";

const empty: undefined[] = [];
const jsonx = /^.*?\?/;
const npmx = /[\\/]node_modules[\\/]/;
const prefix = "\0x-hmr?";

const moduleId = "@tsereact/builder/rollup-plugin-hmr/context";
const refId = "@tsereact/builder/rollup-plugin-hmr/state";

function isSource(id?: string): id is string {
    if (id === undefined) {
        return false;
    }

    if (id[0] === "\0") {
        return false;
    }

    if (npmx.test(id)) {
        return false;
    }

    return isAbsolute(id);
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

function isContext(id: string) {
    if (id.startsWith(prefix)) {
        id = id.replace(jsonx, "");
        return JSON.parse(id) as [ref: string, target: string];
    }

    return empty as [undefined, undefined];
}

function hmr(): Plugin | false {
    if (!isWatchMode()) {
        return false;
    }

    let states: any[] = [];
    const base = resolve();
    const project = process.env.npm_package_name;
    const ticket: any = {};
    const hashes = new Map<string, string>();
    return {
        name: "hmr",

        async resolveId(id, importer, opts) {
            if (id.startsWith(prefix)) {
                return id;
            }

            if (id === refId && isSource(importer)) {
                const result = await this.resolve(moduleId, importer, { ...opts, skipSelf: true });
                if (result && !result.external) {
                    return prefix + JSON.stringify([importer, result.id]);
                }

                return result;
            }

            return undefined;
        },

        load(id) {
            const [ref, target] = isContext(id);
            if (ref && target) {
                const id = tag(base, ref);
                const code = [
                    `import { create } from ${JSON.stringify(target)};\n`,
                    `export default create.apply(undefined, __hmr$$${id});\n`,
                ];

                return code.join("");
            }

            return undefined;
        },

        async buildEnd() {
            hashes.clear();
            states = [];

            const scan = new Map<string, Promise<string>>();
            for (const id of this.getModuleIds()) {
                if (isSource(id)) {
                    scan.set(id, mtimeOf(id));
                }
            }

            const mtimes = new Map<string, string>();
            for (const [id, promise] of scan) {
                mtimes.set(id, await promise);
            }

            walk(this, this.getModuleIds(), (id, info, list) => {
                if (!list) {
                    const result = [
                        ...info.dynamicallyImportedIds,
                        ...info.importedIds,
                    ];

                    return result.sort();
                }

                const result: string[] = [];
                const mtime = mtimes.get(id);
                if (mtime) {
                    const rel = relative(base, id);
                    const ref = isAbsolute(rel) ? rel : slashify(rel);
                    result.push(ref, mtime, "/");
                }

                for (const id of list) {
                    const hash = hashes.get(id);
                    hash && result.push(hash);
                }

                if (result.length) {
                    const hash = hashIt(...result);
                    hashes.set(id, hash);
                }

                return undefined;
            });
        },

        augmentChunkHash(chunk) {
            const result = [] as string[];
            for (const id in chunk.modules) {
                const hash = hashes.get(id);
                hash && result.push(hash);
            }

            if (result.length) {
                return result.sort().join("\n");
            }

            return undefined;
        },

        async generateBundle(_, bundle) {
            const port = await start();
            const ver = (new Date()).valueOf();
            for (const key in bundle) {
                const chunk = bundle[key];
                if (chunk.type === "chunk") {
                    const lines: string[] = [];
                    for (const id in chunk.modules) {
                        const info = this.getModuleInfo(id);
                        if (info) {
                            const list = [
                                ...info.dynamicallyImportedIds,
                                ...info.importedIds,
                            ];

                            for (const id of list) {
                                const [ref, target] = isContext(id);
                                if (ref && target) {
                                    const id = tag(base, ref);
                                    const hash = hashes.get(ref) || "";
                                    const info = [id, ver, hash, project, key, port];
                                    lines.push(`const __hmr$$${id} = ${JSON.stringify(info)};`);

                                    info.pop();
                                    states.push(info);
                                }
                            }
                        }
                    }

                    if (lines.length) {
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
        },

        closeBundle() {
            commit(ticket, { hmr: states, project });
        },
    };
}

export default hmr;