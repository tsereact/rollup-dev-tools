import type { Plugin } from "rollup";

import fs from "fs/promises";
import path, { relative } from "path";

function slashify(value: string) {
    return value.replace(/[\\/]+/g, "/");
}

async function readDirs(dirs: string[]) {
    const queue = new Set<string>();
    for (const dir of dirs) {
        queue.add(path.resolve(dir));
    }

    const result = [] as string[];
    const prefix = path.normalize(path.resolve() + "/");
    for (const dir of queue) {
        const list = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of list) {
            const fn = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                queue.add(fn);
            }
            
            if (entry.isFile() && fn.startsWith(prefix)) {
                result.push(slashify(relative(prefix, fn)));
            }
        }
    }

    return result.sort();
}

export interface ExportMap extends Record<string, string | ExportMap> {

}

function cond(fn: string) {
    fn = path.extname(fn);

    if (fn === ".cjs") {
        return "require";
    }

    if (fn === ".mjs") {
        return "import";
    }

    return "require";
}

// @ts-ignore
function generateExport(prefix: string, files: string[]): ExportMap {
    if (files.length <= 1) {
        return { default: "./" + files[0] };
    }

    const result: ExportMap = {};
    for (const fn of files) {
        if (cond(fn) === "import") {
            result[cond(fn)] = "./" + fn;
        }
    }

    for (const fn of files) {
        result[cond(fn)] = "./" + fn;
    }

    result["default"] = "./" + files[0];
    return result;
}

type Matcher = string | RegExp | ((fn: string) => boolean);
type Matchers = Matcher | Matcher[] | {
    include?: Matcher | Matcher[];
    exclude?: Matcher | Matcher[];
};

const xdots = /\..*\..*$/;
const xjs = /\.[cm]js$/;
const xindex = /\/index$/;
const xmatchers:Matchers = {
    include: xjs,
    exclude: x => xdots.test(path.basename(x)),
};

function check(fn: string, matchers = xmatchers): boolean {
    if (matchers instanceof RegExp) {
        return matchers.test(fn);
    }

    if (typeof matchers === "function") {
        return matchers(fn);
    }

    if (typeof matchers === "string") {
        return path.extname(fn) === matchers;
    }

    if (Array.isArray(matchers)) {
        return matchers.some(x => check(fn, x));
    }

    const { include, exclude } = matchers;
    if (exclude && check(fn, exclude)) {
        return false;
    }

    return !include || check(fn, include);
}

export async function generateExports(dirs: string[] = ["dist"], matchers = xmatchers, generate = generateExport) {
    dirs = dirs.map(x => path.normalize(path.resolve(x) + "/"))

    const groups = new Map<string, string[]>();
    const exports: ExportMap = {};
    for (const fn of await readDirs(dirs)) {
        if (check(fn, matchers)) {
            let prefix = fn.replace(xjs, "");
            const abs = path.resolve(prefix);
            for (const dir of dirs) {
                if (abs.startsWith(dir)) {
                    let suffix = abs.substring(dir.length);
                    suffix = slashify(suffix);

                    if (suffix.length < prefix.length) {
                        prefix = suffix;
                    }
                }
            }

            let group = groups.get(prefix);
            if (group === undefined) {
                groups.set(prefix, group = []);
            }

            group.push(fn);
        }
    }

    for (const [fn, group] of groups) {
        exports["./" + fn] = generate(fn, group.sort());
    }

    for (const fn in exports) {
        const prefix = fn.replace(xindex, "");
        exports[prefix] = exports[fn];
    }

    return exports;
}

export async function rewritePackageJson(exports: Promise<ExportMap> | ExportMap = generateExports()) {
    const jsonString = await fs.readFile("package.json", "utf-8");
    const json = JSON.parse(jsonString);
    Object.assign(json, { exports: await exports })
    await fs.writeFile("package.json", JSON.stringify(json, undefined, 4));
}

interface Options {
    dirs?: string[];
    matchers?: typeof xmatchers;
    generate?: typeof generateExport;
}

function syncDeps(options?: Options): Plugin {
    const { dirs, matchers, generate } = options || {};
    return {
        name: "sync-deps",

        async closeBundle() {
            await rewritePackageJson(generateExports(dirs, matchers, generate));
        }
    };
}

export default syncDeps;
