import { defineConfig } from "rollup";

import copy from "rollup-plugin-copy";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";

import manualChunks from "@tsereact/rollup-dev-tools/plugin-manual-chunks";
import linker from "@tsereact/rollup-dev-tools/plugin-prebuild-linker";

// manualChunks.suppressOutput();

export default defineConfig({
    input: {
        index: "src/index.tsx",
    },

    output: {
        dir: "dist",
        entryFileNames: "[name].mjs",
        chunkFileNames: "assets/chunk.[hash].mjs",
        sourcemap: true,
    },

    plugins: [
        manualChunks({ ".": "client" }),
        linker("dist", "yarn prebuild"),

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
        })
    ]
});
