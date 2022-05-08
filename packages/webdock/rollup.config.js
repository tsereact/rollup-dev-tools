import { builtinModules } from "module";
import { defineConfig } from "rollup";

import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";

import manualChunks from "@tsereact/rollup-plugin-manual-chunks";

const externals = new Set([
    ...builtinModules,
    ...builtinModules.map(x => `node:${x}`),
]);

export default defineConfig({
    external: x => externals.has(x),

    input: {
        index: "src/index.ts",
    },

    output: [
        {
            dir: "dist",
            entryFileNames: "[name].mjs",
            chunkFileNames: "chunk.[hash].mjs",
            format: "esm",
            sourcemap: true,
        },
    ],

    plugins: [
        manualChunks("src/app", {
            "page": "common",
            "main": "client",
        }),

        json(),

        commonjs(),
        nodeResolve(),
        typescript(),

        replace({
            preventAssignment: true,
            values: {
                "process.env.NODE_ENV": "'production'"
            }
        }),

        url({
            destDir: "dist",
            fileName: "asset.[hash][extname]",
            limit: Infinity,
            
            include: [
                "**/*.css",
            ],
        }),
    ],
    
    watch: {
        include: "src/**"
    }
});
