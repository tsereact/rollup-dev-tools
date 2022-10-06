import { spawn } from "child_process";
import { dirname } from "path";
import { OutputChunk, OutputPlugin } from "rollup";
import { makeModuleId, tag } from "../core/ref";

import LinkIndex from "../rollup-tools/LinkIndex";

const jsonx = /^.*?\?/;
const nop = () => {};
const prefix = "__prebuilt$$";

let promise: Promise<void> | undefined;

async function syncIndex(cmd: string, index: LinkIndex, subdir: string, list: string[]) {
    await index.read();

    let prebuild = false;
    for (const id of list) {
        if (id.startsWith("\0link?")) {
            const tail = id.replace(jsonx, "");
            const [target, facet] = JSON.parse(tail) as string[];
            const hash = tag(".", target, facet);
            if (index.add(hash, target, facet)) {
                prebuild = true;
            }
        }
    }

    await index.write();

    if (prebuild) {
        const child = spawn(cmd, {
            stdio: "inherit",
            shell: true,
            env: {
                ...process.env,
                PREBUILD_HINT: index.dir,
                PREBUILD_SUBDIR: subdir,
            },
        });

        try {
            return await new Promise<number>((resolve, reject) => {
                child.on("exit", resolve);
                child.on("error", reject);
            });
        } finally {
            await index.read();
        }
    }

    return 0;
}

async function rewriteChunk(chunk: OutputChunk, dir: string, index: LinkIndex) {
    const added = new Set<string>();
    const base = dirname(`${dir}/${chunk.fileName}`);
    const lines: string[] = [];
    for (const id in chunk.modules) {
        if (id.startsWith("\0link?")) {
            const tail = id.replace(jsonx, "");
            const [target, facet] = JSON.parse(tail) as string[];
            const hash = tag(".", target, facet);
            const fn = index.resolve(hash);
            if (!added.has(hash) && fn) {
                added.add(hash);

                const id = makeModuleId(base, fn);
                lines.push(`import { ${prefix}${hash} } from ${JSON.stringify(id)};`);
            }
        }
    }

    if (lines.length) {
        const { map } = chunk;
        if (map) {
            // Adjust source maps because we are injecting code.
            const prefix = ";".repeat(lines.length);
            map.mappings = `${prefix}${map.mappings}`;
        }

        lines.push(chunk.code);
        chunk.code = lines.join("\n");
    }
}

function linker(cmd: string, subdir = "."): OutputPlugin {
    return {
        name: "linker",

        async generateBundle(opts, bundle) {
            const { dir } = opts;
            if (dir) {
                while (promise !== undefined) {
                    const current = promise;
                    await promise;

                    if (current === promise) {
                        promise = undefined;
                    }
                }

                const index = new LinkIndex(dir, subdir);
                const next = syncIndex(cmd, index, subdir, [...this.getModuleIds()]);
                promise = next.then(nop, nop);

                if (await next) {
                    this.warn("[LINK]: Prebuild Exited: " + await next);
                }

                for (const key in bundle) {
                    const chunk = bundle[key];
                    if (chunk.type === "chunk") {
                        rewriteChunk(chunk, dir, index);
                    }
                }
            }
        }
    };
}

export default linker;
