import { defineConfig } from "rollup";
import { builtinModules } from "module";
import { terser } from "rollup-plugin-terser";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import manualChunks from "@tsereact/rollup-dev-tools/plugin-manual-chunks";
import primer from "@tsereact/rollup-dev-tools/plugin-prebuild/primer";

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

        commonjs({ sourceMap: false }),
        nodeResolve(),
        
        replace({
            preventAssignment: true,
            values: {
                "__dirname": "(process.cwd())",
                "eval": "(0 || eval)",
                "process.env.NODE_ENV": JSON.stringify("production"),
            }
        }),
    ]
});
