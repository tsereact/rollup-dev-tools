import { isAbsolute } from "path";
import { defineConfig } from "rollup";

import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default defineConfig({
    external: x => !isAbsolute(x) && x[0] !== ".",

    input: {
        linker: "src/linker.ts",
        primer: "src/primer.ts",
    },

    output: [
        {
            dir: "dist",
            format: "cjs",
            entryFileNames: "[name].cjs",
            chunkFileNames: "[name].[hash].cjs",
            exports: "named",
            sourcemap: true,
        },
        {
            dir: "dist",
            format: "esm",
            entryFileNames: "[name].mjs",
            chunkFileNames: "[name].[hash].mjs",
            sourcemap: true,
        },
    ],
    plugins: [
        nodeResolve(),
        typescript(),
    ],
    watch: {
        include: "src/**"
    }
});
