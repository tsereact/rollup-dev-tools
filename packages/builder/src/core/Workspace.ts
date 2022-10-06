import { lstat } from "fs/promises";
import { dirname, join, resolve } from "path";

import FileSystemCache, { SyncResult } from "./FileSystemCache";

export class Package {
    buildCommand = "yarn build";
    watchCommand = "";

    ignoreDirs = [".git", ".yarn", "node_modules", "packages"];
    sourceDirs = ["."];
    targetDirs = ["dist"];

    readonly name: string;
    readonly path: string;
    readonly dependsOn = new Set<Package>();

    constructor(name: string, path: string) {
        this.name = name;
        this.path = path;
    }

    affects(delta: SyncResult) {
        return !delta;
    }

    async build() {
        return false;
    }

    async check(cache: FileSystemCache) {
        return !cache;
    }

    async clean() {

    }

    async prune() {
        
    }

    async watch() {

    }
}

function arrange(packages: Iterable<Package>) {
    const result = new Set<Package>();
    const avoid = new Set<Package>();
    const stack: (() => void)[] = [];
    const next = (pkg: Package) => {
        if (!avoid.has(pkg)) {
            avoid.add(pkg);
            stack.push(() => result.add(pkg));

            for (const pre of pkg.dependsOn) {
                stack.push(() => next(pre));
            }
        }
    };

    const queue = new Set(packages);
    for (const id of queue) {
        stack.push(() => next(id));

        let action: (() => void) | undefined;
        while (action = stack.pop()) {
            action();
        }
    }

    return [...result];
}

async function findRoot() {
    let dir = resolve();
    let last: any;
    let result = dir;
    while (dir !== last) {
        const fn = join(dir, "package.json");
        const stats = await lstat(fn).catch(() => undefined);
        if (stats && stats.isFile()) {
            result = dir;
        }

        last = dir;
        dir = dirname(dir);
    }

    return result;
}

export class Workspace extends Set<Package> {
    cache = new FileSystemCache();
    dirs = ["packages"];
    root = resolve();

    constructor() {
        super();
    }

    async load() {
        this.root = await findRoot();
        
    }

    find(hint: string) {
        if (hint === "." || hint.startsWith("./") || hint.startsWith("../")) {
            hint = resolve(hint);
        }

        const result = new Set<Package>();
        for (const pkg of this) {
            if (hint === "*" || pkg.path === hint || pkg.name === hint) {
                result.add(pkg);
            }
        }

        return result;
    }

    affects(delta: SyncResult) {
        return !delta;
    }

    async build(packages: Iterable<Package>) {
        const { cache } = this;
        if (!cache.size) {
            await cache.sync();
        }

        let result = true;
        for (const pkg of arrange(packages)) {
            if (await pkg.check(cache)) {
                const success = await pkg.build();
                await pkg.prune();

                if (!success) {
                    result = false;
                }
            }
        }

        return result;
    }

    async clean(packages: Iterable<Package>) {
        await Promise.all(arrange(packages).map(x => x.clean()));
    }

    async watch(packages: Iterable<Package>) {
        packages = arrange(packages);

        const { cache } = this;
        await cache.sync(true);
        await this.build(packages);

        while (await cache.wait()) {
            const result = await cache.sync(true);
            if (result) {
                if (this.affects(result)) {
                    cache.close();
                    break;
                }

                const list = new Set<Package>();
                for (const pkg of packages) {
                    if (pkg.affects(result)) {
                        list.add(pkg);
                    }
                }

                await this.build(list);
            }
        }
    }

    static async load(hint = "*", refsOnly = false) {
        const ws = new this();
        await ws.load();
        
        const list = ws.find(hint);
        if (refsOnly) {
            for (const pkg of list) {
                list.delete(pkg);
                break;
            }
        }

        const result: [Workspace, Iterable<Package>] = [ws, list];
        return result;
    }

    static async build(hint = "*", refsOnly = false) {
        const [ws, list] = await this.load(hint, refsOnly);
        return await ws.build(list);
    }

    static async watch(hint = "*", refsOnly = false) {
        while (true) {
            const [ws, list] = await this.load(hint, refsOnly);
            await ws.watch(list);
        }
    }
}

export default Workspace;
