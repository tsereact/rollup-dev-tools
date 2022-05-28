import { defineConfig } from "rollup";
import { builtinModules } from "module";
import { terser } from "rollup-plugin-terser";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import manualChunks from "@tsereact/rollup-dev-tools/plugin-manual-chunks";
import primer from "@tsereact/rollup-dev-tools/plugin-prebuild-primer";

const externals = new Set([
    ...builtinModules,
    ...builtinModules.map(x => `node:${x}`)
]);

export default defineConfig({
    context: "{}",
    external: id => externals.has(id),

    output: {
        dir: "dist",
        entryFileNames: "assets/chunk.[hash].mjs",
        chunkFileNames: "assets/chunk.[hash].mjs",
        plugins: [
            terser({
                // node-fetch has "issues"
                keep_classnames: true,
                keep_fnames: true,
            })
        ]
    },

    plugins: [
        primer("dist"),
        manualChunks({ "npm:": "vendor" }),

        // part of @emotion still relies on a CJS import.
        // this will only convert pure-cjs code and it leaves esm code alone.
        commonjs({ sourceMap: false }),
        nodeResolve(),

        replace({
            preventAssignment: true,
            values: {
                "process.env.NODE_ENV": JSON.stringify("production"),
            }
        }),
    ]
});
