import { defineConfig } from "rollup";

import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";

import chunkLogger from "@tsereact/builder/rollup-plugin-chunk-logger";
import chunkOptimizer from "@tsereact/builder/rollup-plugin-chunk-optimizer";
import linker from "@tsereact/builder/rollup-plugin-linker";
import resolver from "@tsereact/builder/rollup-plugin-resolver";
import hmr from "@tsereact/builder/rollup-plugin-hmr";
import webServer from "@tsereact/builder/rollup-plugin-web-server";

export default defineConfig({
    context: "{}",

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
        hmr(),

        resolver(x => {
            if (x.isResolved("src/**")) {
                return x.default();
            }

            if (x.isResolved("npm:*/**")) {
                return x.link("npm")
            }

            if (x.isResolved("ws:*/**")) {
                return x.link("ws")
            }
        }),

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
        linker("yarn watch:link"),
        webServer(),
    ]
});
