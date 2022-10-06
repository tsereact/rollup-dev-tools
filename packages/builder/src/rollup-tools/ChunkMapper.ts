import { GetManualChunkApi, PluginContext } from "rollup";
import { GlobInit } from "../core/GlobSet";
import { intersect, selectTrees } from "./walk";

import ChunkLayout from "./ChunkLayout";

export type Filter = GlobInit | Record<string, GlobInit>;

function isGlobInit(x: Filter): x is GlobInit {
    if (typeof x === "string") {
        return true;
    }

    if (typeof x === "function") {
        return true;
    }

    if (Array.isArray(x)) {
        return true;
    }

    return false;
}

class ChunkMapper extends Set<string> {
    private chunks: ChunkLayout;
    private ctx: PluginContext | GetManualChunkApi;

    constructor(ctx: PluginContext | GetManualChunkApi, chunks: ChunkLayout, set: Iterable<string> = ctx.getModuleIds()) {
        super(set);
        this.ctx = ctx;
        this.chunks = chunks;
    }

    all() {
        const { chunks, ctx } = this;
        return new ChunkMapper(ctx, chunks);
    }

    /**
     * Computes the spanning tree and keeps nodes
     * @param filters 
     */
    keep(...filters: Filter[]) {
        let set: Set<string> = this;
        const { chunks, ctx } = this;
        const first = filters.filter(isGlobInit);
        if (first.length) {
            set = intersect(set, selectTrees(ctx, ctx.getModuleIds(), ...first));
        }

        const others = filters.map(x => isGlobInit(x) ? [] : Object.values(x)).flat();
        for (const other of others) {
            set = intersect(set, selectTrees(ctx, ctx.getModuleIds(), other));
        }

        return new ChunkMapper(ctx, chunks, set);
    }

    assign(name: string, ...filters: Filter[]) {
        const { chunks } = this;
        return chunks.assign(name, this.keep(...filters));
    }

    generate(name: string, ...filters: Filter[]) {
        const { chunks } = this;
        return chunks.generate(name, this.keep(...filters));
    }
}

export default ChunkMapper;
