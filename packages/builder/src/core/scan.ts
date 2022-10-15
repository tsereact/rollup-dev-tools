import { Dirent } from "fs";
import { basename, dirname, join, resolve } from "path";
import { readdir, readFile } from "fs/promises";

import GlobSet, { GlobInit } from "./GlobSet";
import { relativeStrict } from "./ref";

const empty: Dirent[] = [];

export function flat(array: (string | Iterable<string>)[]) {
    return array.map(x => typeof x === "string" ? x : [...x]).flat();
}

export function keep(list: string[], ...filters: GlobInit[]) {    
    const filter = GlobSet.create(...filters);
    return list.filter(filter.match);
}

export function skip(list: string[], ...filters: GlobInit[]) {    
    const filter = GlobSet.create(...filters);
    return list.filter(x => !filter.match(x));
}

export function readdirSafe(dir: string) {
    return readdir(dir, { withFileTypes: true }).catch(() => empty);
}

export async function scan(roots: string[], ignore?: (fn: string, dir: string, siblings: Set<string>) => boolean) {
    const results = new Set<string>();
    const queue = new Set(roots.map(x => resolve(x)));
    for (const dir of queue) {
        const entries = await readdirSafe(dir);
        const siblings = new Set(entries.map(x => x.name));
        for (const entry of entries) {
            const fn = join(dir, entry.name);
            if (entry.isDirectory() && (!ignore || !ignore(fn, dir, siblings))) {
                queue.add(fn);
            }

            if (entry.isFile()) {
                results.add(fn);
            }
        }
    }

    return [...results];
}

export interface Manifest {
    name: string;
    path: string;
    refs: Manifest[];
    deps: string[];
    tags: string[];
}

function isObject(value: any) {
    return typeof value === "object" && value && !Array.isArray(value);
}

async function readManifest(dir: string) {
    const manifest: Manifest = {
        name: "",
        path: "",
        refs: [],
        deps: [],
        tags: [],
    };

    let hints: string[] = [];
    try {
        const json = await readFile(join(dir, "package.json"), "utf-8");
        const raw = JSON.parse(json);
        if (isObject(raw)) {
            manifest.path = dir;

            const { name, devDependencies, dependencies, workspaces, tags } = raw;
            if (typeof name === "string") {
                manifest.name = name;
            }

            const { deps } = manifest;
            if (isObject(devDependencies)) {
                deps.push(...Object.keys(devDependencies));
            }

            if (isObject(dependencies)) {
                deps.push(...Object.keys(dependencies));
            }

            if (Array.isArray(workspaces)) {
                hints = workspaces.filter(x => typeof x === "string");
            }

            if (Array.isArray(tags)) {
                manifest.tags = tags.filter(x => x && typeof x === "string");
            }

            manifest.deps = [...new Set(manifest.deps)];
        }
    } catch {
        // don't care
    }
    
    return { manifest, hints };
}

async function findPackageRoot() {
    let last: any
    let path = resolve();
    const cwd = path;
    while (last !== path) {
        const { manifest, hints } = await readManifest(path);
        if (hints.length) {
            return { manifest, hints };
        }

        last = path;
        path = dirname(path);
    }

    const { manifest, hints } = await readManifest(cwd);
    manifest.path = cwd;

    return { manifest, hints };
}

async function expand(root: string, hint: string) {
    hint = resolve(root, hint);

    const dirs: string[] = [];
    if (!relativeStrict(root, hint)) {
        return dirs;
    }

    if (basename(hint) === "*") {
        hint = dirname(hint);
        
        const list = await readdirSafe(hint);
        return list.map(x => join(hint, x.name));
    }

    dirs.push(hint);
    return dirs;
}

export async function scanForPackages() {
    const { manifest: root, hints } = await findPackageRoot();
    const manifests = new Map<string, Manifest>();
    manifests.set(".", root);

    for (const hint of hints) {
        for (const dir of await expand(root.path, hint)) {
            const { manifest } = await readManifest(dir);
            if (manifest.path) {
                const key = relativeStrict(root.path, manifest.path);
                manifests.set(key, manifest);    
            }
        }
    }

    const lookup = new Map<string, Manifest[]>();
    for (const manifest of manifests.values()) {
        let list = lookup.get(manifest.name);
        if (list === undefined) {
            lookup.set(manifest.name, list = []);
        }

        list.push(manifest);
    }

    for (const manifest of manifests.values()) {
        for (const dep of manifest.deps) {
            const list = lookup.get(dep);
            list && manifest.refs.push(...list);
        }
    }

    return manifests;
}

export function findThisPackage(manifests: Map<string, Manifest>) {
    const dir = resolve();
    const root = manifests.get(".");
    if (root) {
        if (root.path === dir) {
            return root;
        }
    
        return manifests.get(relativeStrict(root.path, dir));
    }

    return undefined;
}