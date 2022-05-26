import { defineConfig } from "rollup";

import hmr from "@tsereact/rollup-dev-tools/plugin-hmr";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default defineConfig({
    input: {
        index: "src/index.ts",
    },

    output: {
        dir: "dist",
        entryFileNames: "[name].mjs",
        chunkFileNames: "assets/chunk.[hash].mjs",
        sourcemap: true,
    },

    plugins: [
        hmr(),
        typescript(),
        nodeResolve(),
    ]
});
