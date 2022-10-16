import type { Plugin } from "rollup";

import { configure, block, refresh, start } from "../core/webServer";
import { isRunMode } from "../core/modes";
import { resolve } from "path";

export function webServer(webPath?: string, outPath?: string): Plugin | false {
    if (!isRunMode()) {
        return false;
    }

    const paths: [string, string][] = [];
    const stablePaths: [string, string][] = []
    configure((_, paths) => {
        paths.push(...stablePaths);
    });

    const lock = {};
    block(lock);

    return {
        name: "web-server",

        generateBundle(opts) {
            block(lock);
            paths.push([webPath || "/", resolve(outPath || opts.dir || ".")]);
        },

        async closeBundle() {
            stablePaths.length = 0;
            stablePaths.push(...paths);
            paths.length = 0;

            if (refresh(lock)) {
                console.info("[WebServer]: %s", await start());
            }
        }
    };
}

export default webServer;
