import { GetManualChunkApi, PluginContext } from "rollup";
import { shards } from "./walk";

class ChunkLayout extends Map<string, string> {
    private ctx: PluginContext | GetManualChunkApi;

    constructor(ctx: PluginContext | GetManualChunkApi) {
        super();
        this.ctx = ctx;
    }

    /**
     * Add a component to the chunk set.
     * @param name 
     * @param component The name
     */
    assign(name: string, component: Iterable<string>) {
        for (const id of component) {
            if (!this.has(id)) {
                this.set(id, name);
            }
        }

        return this;
    }

    clear(component?: Iterable<string>) {
        if (component) {
            for (const id of component) {
                this.delete(id);
            }
        } else {
            super.clear();
        }
    }

    generate(name: string, components: Iterable<string>) {
        let i = 0;
        const { ctx } = this;
        for (const shard of shards(ctx, components)) {
            this.assign(`${name}-${i++}`, shard);
        }

        return this;
    }
}

export default ChunkLayout;
