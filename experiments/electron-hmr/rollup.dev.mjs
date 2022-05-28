import { defineConfig } from "rollup";

import copy from "rollup-plugin-copy";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";

import manualChunks from "@tsereact/rollup-dev-tools/plugin-manual-chunks";
import linker from "@tsereact/rollup-dev-tools/plugin-prebuild-linker";

import hmr from "@tsereact/rollup-dev-tools/plugin-hmr";
import interop from "@tsereact/rollup-dev-tools/plugin-interop";

manualChunks.suppressOutput();

export default defineConfig({
    input: {
        index: "src/index.tsx",
        main: "src/main.ts",
    },

    output: {
        dir: "dist",
        entryFileNames: "[name].mjs",
        chunkFileNames: "assets/chunk.[hash].mjs",
        sourcemap: true,
    },

    plugins: [
        manualChunks({
            "src/index": "renderer",
            "src/main": "main",
        }),

        linker("dist", "yarn prebuild"),

        hmr(),
        interop(),
        typescript(),
        nodeResolve(),
        
        url({
            limit: 0,
            destDir: "dist",
            fileName: "asset.[hash][extname]",
            include: [
                "**/*.svg",
            ],
        }),

        copy({
            hook: "writeBundle",
            targets: [
                {
                    src: "public/*",
                    dest: "dist"
                }
            ]
        }),
    ]
});
