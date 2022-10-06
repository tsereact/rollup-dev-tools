import { OutputPlugin } from "rollup";

import { basename, dirname, isAbsolute } from "path";
import { pathToName } from "../core/ref";

const empty: [string, string] = ["virtual", ""];

function nameOf(id: string): [string, string] {
    const name = pathToName(id);
    if (name === "\0") {
        return empty;
    }

    let prefix = "src ";
    let dir = dirname(name);
    if (dir.startsWith("npm:")) {
        prefix = "npm "
        dir = dir.substring(4);
    }

    if (isAbsolute(name)) {
        prefix = "workspace ";
    }

    return [prefix + dirname(name), basename(name)];
}

function emitGroup(dir: string, group: string[]) {
    console.info("  %s: ", dir, group.join(" "));
}

function chunkLogger(): OutputPlugin {
    return {
        name: "chunk-logger",

        writeBundle(_, bundle) {
            for (const fn in bundle) {
                const chunk = bundle[fn];
                if (chunk && chunk.type === "chunk") {
                    const modules = Object.keys(chunk.modules);
                    const size = Buffer.byteLength(chunk.code);
                    console.info("chunk:", fn, size, modules.length);

                    let dir = "";
                    const group: string[] = [];
                    for (const id of modules.sort()) {
                        const [key, name] = nameOf(id);
                        if (dir !== key) {
                            dir && emitGroup(dir, group);
                            dir = key;
                        }

                        name && group.push(name);
                    }

                    dir && emitGroup(dir, group);
                }
            }
        },
    };
}

export default chunkLogger;
