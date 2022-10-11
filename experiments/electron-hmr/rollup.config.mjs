import { defineConfig } from "rollup";

import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";

import chunkLogger from "@tsereact/builder/rollup-plugin-chunk-logger";
import chunkOptimizer from "@tsereact/builder/rollup-plugin-chunk-optimizer";
import hmr from "@tsereact/builder/rollup-plugin-hmr";
import resolver from "@tsereact/builder/rollup-plugin-resolver";

export default defineConfig({
    context: "{}",

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
        resolver(x => {
            if (x.isNative()) {
                return x.hoist();
            }
        }),

        hmr(),

        typescript(),
        nodeResolve(),
        commonjs(),

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

        replace({
            preventAssignment: true,
            values: {
                "process.env.NODE_ENV": JSON.stringify("production"),
            }
        }),

        chunkOptimizer({
            npm: "npm:*/**",
            lib: "ws:*/**",
        }),

        chunkLogger(),
    ]
});
