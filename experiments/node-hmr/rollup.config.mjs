import { defineConfig } from "rollup";

import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

import hmr from "@tsereact/builder/rollup-plugin-hmr";
import run from "@tsereact/builder/rollup-plugin-run";

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

        run({
            fork: "dist/index.mjs",
            kill: false,
        })
    ]
});
