import { readFile } from "fs/promises";
import { isAbsolute } from "path";
import { defineConfig } from "rollup";

import commonjs from "@rollup/plugin-commonjs";
import inject from "@rollup/plugin-inject";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

function entry(name) {
    return { 
        [name]: `src/${name}/index.ts`
    };
}

export default defineConfig({
    input: {
        "servers": "src/servers.ts",
        "bin/ws-build": "src/bin/ws-build.ts",
        "core/IpcConsole": "src/core/IpcConsole.ts",

        "rollup-plugin-hmr": "src/rollup-plugin-hmr/index.ts",
        "rollup-plugin-hmr/context": "src/rollup-plugin-hmr/context.ts",
        "rollup-plugin-hmr/state": "src/rollup-plugin-hmr/state.ts",
        
        "rollup-plugin-chunk-logger": "src/rollup-plugin-chunk-logger/index.ts",
        "rollup-plugin-chunk-optimizer": "src/rollup-plugin-chunk-optimizer/index.ts",
        "rollup-plugin-resolver": "src/rollup-plugin-resolver/index.ts",
        "rollup-plugin-web-server": "src/rollup-plugin-web-server/index.ts",
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
        commonjs(),

        inject({
            modules: {
                self: "mocks/self"
            }
        }),

        nodeResolve(),
        typescript(),

        {
            name: "custom",

            resolveId(id, importer) {
                if (importer === undefined) {
                    return undefined;
                }

                if (id[0] === "\0") {
                    return id;
                }

                if (id === "mocks/self") {
                    return `\0${id}?${importer}`;
                }
        
                if (isAbsolute(id)) {
                    return undefined;
                }
        
                if (id[0] === ".") {
                    return undefined;
                }
        
                if (id === "xterm" || id.startsWith("xterm/") || id.startsWith("xterm-")) {
                    return undefined;
                }
        
                return { id, external: true };
            },

            async load(id) {
                if (id.startsWith("\0mocks/self?")) {
                    return "export const self = {}; export default self;";
                }

                if (isAbsolute(id) && id.endsWith(".css")) {
                    const text = await readFile(id, "utf-8");
                    return `export const css = ${JSON.stringify(text)}; export default css;`;
                }
            },
        }
    ],
    watch: {
        include: "src/**"
    }
});
