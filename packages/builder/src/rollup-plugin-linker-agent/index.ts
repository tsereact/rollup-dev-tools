import { resolve } from "path";
import { Plugin } from "rollup";
import LinkIndex from "../rollup-tools/LinkIndex";
import { makeModuleId, pathToName } from "../core/ref";

const prefix = "__prebuilt$$";

function linkerAgent(): Plugin {
    let hint: string | undefined;
    let subdir: string | undefined;
    let codes: Record<string, string[]> = {};
    return {
        name: "linker-agent",

        async options(opts) {
            hint = process.env.PREBUILD_HINT;
            subdir = process.env.PREBUILD_SUBDIR;

            if (hint) {
                const index = new LinkIndex(hint);
                await index.read();

                const input = opts.input = {} as Record<string, string>;
                codes = {};

                for (const [name, { target, facet }] of index) {
                    const id = "\0init?" + facet;
                    const code = codes[id] || [];
                    codes[id] = code;

                    const fn = resolve(index.dir, target);
                    input[facet] = id;
                    code.push(`import * as ${prefix}${name} from ${JSON.stringify(fn)};`);
                    code.push(`export { ${prefix}${name} };`);

                    console.log("[LINK]: %s +", facet, pathToName(fn));
                }
            }

            return opts;
        },

        resolveId(id) {
            if (id in codes) {
                return id;
            }

            return undefined;
        },

        load(id) {
            if (id in codes) {
                return codes[id].join("\n");
            }

            return undefined;
        },

        async writeBundle(opts, bundle) {
            const { dir } = opts;
            if (dir && subdir) {
                const index = new LinkIndex(dir, subdir);
                await index.read();

                for (const key in bundle) {
                    const chunk = bundle[key];
                    if (chunk.type === "chunk" && chunk.isEntry) {
                        for (const entry of index.values()) {
                            const fn = makeModuleId(index.dir, resolve(dir, chunk.fileName));
                            if (entry.facet === chunk.name) {
                                entry.chunk = fn;
                            }
                        }
                    }
                }

                await index.write();
            }
        }
    };
}

export default linkerAgent;
