import { GetManualChunkApi, OutputPlugin } from "rollup";
import { pathToName } from "../core/ref";
import { walk } from "../rollup-tools/walk";

import GlobSet, { GlobInit } from "../core/GlobSet";

export interface ModuleMatcher {
    (id: string, api: GetManualChunkApi): boolean;
}

export type Filter = string | ModuleMatcher | (string | ModuleMatcher)[];

export interface ChunkOptimizerOptions {
    [key: string]: Filter | {
        hint: Filter;
        edge: Filter;
    };
}

function never() {
    return false;
}

function isEntry(api: GetManualChunkApi) {
    return (id: string) => {
        const info = api.getModuleInfo(id);
        return !!info && info.isEntry;
    }
}

function convertMatch(api: GetManualChunkApi, input: Filter) {
    if (Array.isArray(input)) {
        const fixed = input.map((part): GlobInit => {
            if (typeof part === "function") {
                return id => part(id, api);
            }

            const [matcher] = GlobSet.compile(part);
            return id => matcher(pathToName(id));
        });
        
        const filter = new GlobSet(...fixed);
        return (id: string) => filter.match(id);
    }

    if (typeof input === "function") {
        return (id: string) => input(id, api);
    }

    const filter = new GlobSet(input);
    return (id: string) => filter.match(pathToName(id));
}

function convertEntry(api: GetManualChunkApi, informal: ChunkOptimizerOptions[string]) {
    let edge: (id: string) => boolean = never;
    let hint: (id: string) => boolean = never;
    if (Array.isArray(informal) || typeof informal !== "object") {
        edge = convertMatch(api, informal);
        hint = isEntry(api);

        return { edge, hint };
    }

    edge = convertMatch(api, informal.edge);
    hint = convertMatch(api, informal.hint);

    return { edge, hint };
}

function chunkOptimizer(options: ChunkOptimizerOptions): OutputPlugin {
    return {
        name: "chunk-optimizer",

        outputOptions(opts) {
            const { manualChunks } = opts;
            if (typeof manualChunks === "function" || manualChunks === undefined) {
                let hints: Map<string, string> | undefined;
                opts.manualChunks = (id, api) => {
                    if (!hints) {
                        hints = new Map<string, string>();

                        const result = hints;
                        for (const [name, entry] of Object.entries(options)) {
                            const { hint, edge } = convertEntry(api, entry);
                            const seeds = [...api.getModuleIds()].filter(hint);
                            walk(api, seeds, (id, info) => {
                                if (hint(id)) {
                                    return info.importedIds;
                                }

                                if (info.dynamicImporters.length) {
                                    return undefined;
                                }

                                if (!edge(id)) {
                                    return info.importedIds;
                                }

                                result.set(id, name);
                                return undefined;
                            });
                        }
                    }

                    const result = manualChunks?.(id, api);
                    return result !== undefined ? result : hints.get(id);
                };
            }

            return opts;
        },
    };
}

export default chunkOptimizer;
