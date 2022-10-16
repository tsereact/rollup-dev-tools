import { defineConfig } from "rollup";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import chunkLogger from "@tsereact/builder/rollup-plugin-chunk-logger";
import linkerAgent from "@tsereact/builder/rollup-plugin-linker-agent";

export default defineConfig({
    context: "{}",

    output: {
        dir: "dist",
        entryFileNames: "assets/prebuilt.[hash].mjs",
        chunkFileNames: "assets/prebuilt.[hash].mjs",
        sourcemap: true,
    },

    plugins: [
        nodeResolve(),
        commonjs(),

        replace({
            preventAssignment: true,
            values: {
                "process.env.NODE_ENV": JSON.stringify("production"),
            }
        }),

        chunkLogger(),
        linkerAgent(),
    ]
});
