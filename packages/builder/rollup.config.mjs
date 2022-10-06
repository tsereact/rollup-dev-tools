import { isAbsolute } from "path";
import { defineConfig } from "rollup";

import typescript from "@rollup/plugin-typescript";

function entry(name) {
    return { 
        [name]: `src/${name}/index.ts`
    };
}

export default defineConfig({
    external: x => !isAbsolute(x) && x[0] !== ".",

    input: {
        ...entry("rollup-plugin-chunk-optimizer"),
        ...entry("rollup-plugin-glob-support"),
        ...entry("rollup-plugin-linker"),
        ...entry("rollup-plugin-linker-agent"),
        ...entry("rollup-plugin-resolver"),
    },

    output: [
        {
            dir: "dist",
            format: "cjs",
            entryFileNames: "cjs/[name].cjs",
            chunkFileNames: "assets/asset.[hash].cjs",
            exports: "named",
            sourcemap: true,
        },
        {
            dir: "dist",
            format: "esm",
            entryFileNames: "esm/[name].mjs",
            chunkFileNames: "assets/asset.[hash].mjs",
            sourcemap: true,
        },
    ],
    plugins: [
        typescript(),
    ],
    watch: {
        include: "src/**"
    }
});
