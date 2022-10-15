import { dirname, isAbsolute, resolve } from "path";
import { Plugin } from "rollup";
import { entryName, relativeStrict } from "../core/ref";
import { scan } from "../core/scan";

import GlobSet from "../core/GlobSet";

const jsonx = /^x-glob\?/

async function search(glob: string, importer?: string) {
    const result: [string, string][] = [];
    const [matcher, prefix] = GlobSet.compile(glob);
    const filter = new GlobSet(matcher);
    const base = importer ? dirname(importer) : resolve();
    const dir = resolve(base, prefix);
    for (const fn of await scan([dir])) {
        const rel = relativeStrict(dir, fn);
        const name = `${prefix}${rel}`;
        if (rel && filter.match(name)) {
            return [name, fn];
        }
    }

    return result;
}

async function entries(key: string, glob: string) {
    const result: [string, string][] = [];
    const [matcher, prefix, plain] = GlobSet.compile(glob);
    if (plain) {
        result.push([key, glob]);
        return result;
    }
    
    const filter = GlobSet.create(matcher);
    const dir = resolve(prefix);
    for (const fn of await scan([dir])) {
        const rel = relativeStrict(dir, fn);
        const name = `${prefix}${rel}`;
        if (rel && filter.match(name)) {
            result.push([entryName(key, rel), name])
        }
    }

    return result;
}

function globImport(): Plugin {
    return {
        name: "glob-import",

        async options(opts) {
            const { input } = opts;
            if (Array.isArray(input)) {
                const result = opts.input = [] as string[];
                for (const hint of input) {
                    for (const [, entry] of await entries("", hint)) {
                        result.push(entry);
                    }
                }
            } else if (typeof input === "object") {
                const result = opts.input = {} as Record<string, string>;
                for (const [prefix, hint] of Object.entries(input)) {
                    for (const [key, entry] of await entries(prefix, hint)) {
                        result[key] = entry;
                    }
                }
            }

            return opts;
        },

        resolveId(id, importer) {
            if (id[0] !== "\0" && id.indexOf("*") >= 0 && (!importer || isAbsolute(importer))) {
                return "\0x-glob?" + JSON.stringify([id, importer]);
            }

            return undefined;
        },

        async load(id) {
            if (jsonx.test(id)) {
                const [glob, importer] = JSON.parse(id.replace(jsonx, "")) as [string, string?];
                const files = await search(glob, importer);
                const code = [
                    "export const __files = {",
                    files.map((name, fn) => `    ${JSON.stringify(name)}: () => import(${JSON.stringify(fn)}),`),
                    "};",
                ];

                return code.flat().join("\n");
            }

            return undefined;
        }
    };
}

export default globImport;
