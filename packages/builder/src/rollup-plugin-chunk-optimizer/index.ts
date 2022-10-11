import { GetManualChunkApi, OutputPlugin } from "rollup";
import { kernel } from "../rollup-tools/walk";

import ChunkLayout from "../rollup-tools/ChunkLayout";
import ChunkMapper, { Filter } from "../rollup-tools/ChunkMapper";

export interface ChunkOptimizerCallback {
    (kernel: ChunkMapper, chunks: ChunkLayout, api: GetManualChunkApi): any;
}

export interface ChunkOptimizerGroups {
    [key: string]: Filter | Filter[];
}

function chunkOptimizer(spec: ChunkOptimizerCallback | ChunkOptimizerGroups): OutputPlugin {
    return {
        name: "chunk-optimizer",

        outputOptions(opts) {
            const { manualChunks } = opts;
            if (typeof manualChunks === "function" || manualChunks === undefined) {
                let chunks: ChunkLayout | undefined;
                opts.manualChunks = (id, api) => {
                    if (chunks === undefined) {
                        chunks = new ChunkLayout(api);

                        const graph = new ChunkMapper(api, chunks, kernel(api));
                        if (typeof spec === "function") {
                            spec(graph, chunks, api);
                        } else {
                            for (const [name, entry] of Object.entries(spec)) {
                                graph.generate(name, ...[entry].flat());
                            }
                        }
                    }

                    const result = manualChunks?.(id, api);
                    return result !== undefined ? result : chunks.get(id);
                };
            }

            return opts;
        },
    };
}

export default chunkOptimizer;
