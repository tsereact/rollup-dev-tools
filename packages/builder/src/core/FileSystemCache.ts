import { watch, BigIntStats, FSWatcher, Dirent } from "fs";
import { lstat, readdir } from "fs/promises";
import { basename, join, resolve } from "path";

const _false = Promise.resolve(false);
const _true = Promise.resolve(true);

export type PartialStats = (BigIntStats | Dirent) & Partial<BigIntStats>;

export interface SyncResult {
    added: FolderState[];
    removed: FolderState[];
    changed: [FolderState, FolderState][];
}

async function stat(fn: string): Promise<PartialStats | undefined> {
    return lstat(fn, { bigint: true }).catch(() => undefined);
}

export class FolderState extends Map<string, PartialStats> {
    readonly name: string;
    readonly path: string;
    readonly stats: BigIntStats;

    constructor(name: string, path: string, stats: BigIntStats) {
        super();
        this.name = name;
        this.path = path;
        this.stats = stats;
    }
}

function compare(x?: FolderState, y?: FolderState) {
    const delta = new Set<string>();
    const ignore = new Set<string>();
    if (x && y) {
        for (const [fn, oldStats] of x) {
            if (oldStats.isDirectory()) {
                const newStats = y.get(fn);
                if (newStats && newStats.isDirectory()) {
                    if (oldStats.mtimeNs === newStats.mtimeNs && oldStats.size === newStats.size) {
                        ignore.add(fn)
                    }
                }
            }
        }
    }

    if (x) {
        for (const [fn, stats] of x) {
            if (stats.isDirectory() && !ignore.has(fn)) {
                delta.add(fn);
            }
        }
    }

    if (y) {
        for (const [fn, stats] of y) {
            if (stats.isDirectory() && !ignore.has(fn)) {
                delta.add(fn);
            }
        }
    }

    return delta;
}

function diff(x?: FolderState, y?: FolderState) {
    if (!x && !y) {
        return false;
    }

    if (!x || !y || x.size !== y.size) {
        return true;
    }

    if (x.size !== y.size) {
        return true;
    }

    for (const [fn, oldStats] of x) {
        const newStats = y.get(fn);
        if (!newStats) {
            return true;
        }

        if (oldStats.isDirectory() !== newStats.isDirectory()) {
            return true;
        }

        if (oldStats.isFile() !== newStats.isFile()) {
            return true;
        }

        if (oldStats.mtimeNs !== newStats.mtimeNs) {
            return true;
        }

        if (oldStats.size !== newStats.size) {
            return true;
        }
    }

    return false;
}

async function scan(dir: string) {
    const stats = await stat(dir);
    if (!stats || !stats.isDirectory()) {
        return undefined;
    }

    const names = await readdir(dir, { withFileTypes: true }).catch(() => undefined);
    if (!names) {
        return undefined;
    }

    const promises = names.map(async x => {
        const fn = join(dir, x.name);
        const result: [string, PartialStats | undefined] = [
            fn, x.isDirectory() && x.isFile() ? await stat(fn) : x,
        ];

        return result;
    });

    const result = new FolderState(basename(dir), dir, stats as BigIntStats);
    for (const [fn, info] of await Promise.all(promises)) {
        info && result.set(fn, info);
    }
    
    return result;
}

export class FileSystemCache extends Map<string, FolderState> {
    readonly ignore = new Set<string>();
    readonly invalid = new Set<string>();
    readonly roots = new Set<string>();
    readonly watchers = new Map<string, FSWatcher>();

    private promise?: Promise<boolean>;
    private pulse?: (result: boolean) => void;

    addIgnore(path: string) {
        this.ignore.add(resolve(path));
    }

    addRoot(path: string) {
        this.roots.add(resolve(path));
        this.invalidate(path);
    }

    invalidate(path: string) {
        if (Object.isFrozen(this)) {
            return false;
        }

        this.invalid.add(resolve(path));
        this.trigger();
        
        return true;
    }

    valid() {
        return !this.invalid.size;
    }

    trigger() {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { pulse } = this;
        pulse?.(true);

        this.promise = _true;
        this.pulse = undefined;
        
        return true;
    }

    block() {
        if (Object.isFrozen(this)) {
            return false;
        }

        const { pulse } = this;
        pulse?.(true);

        this.promise = _true;
        this.pulse = undefined;
        
        return true;
    }

    wait() {
        if (Object.isFrozen(this)) {
            return _false;
        }

        let { promise } = this;
        if (!promise) {
            promise = this.promise = new Promise<boolean>(x => this.pulse = x);
        }

        return promise;
    }

    async sync(track = false) {
        if (Object.isFrozen(this)) {
            return false;
        }

        this.block();

        const { invalid } = this;
        const queue = new Set(invalid);
        invalid.clear();

        let changes = false;
        const added: FolderState[] = [];
        const removed: FolderState[] = [];
        const changed: [FolderState, FolderState][] = [];
        const result: SyncResult = { added, removed, changed };
        const { ignore, watchers } = this;
        for (const dir of queue) {
            if (ignore.has(dir)) {
                continue;
            }

            if (!watchers.has(dir) && track) {
                const watcher = watch(dir, {
                    encoding: "utf-8",
                    persistent: false,
                });

                const trigger = () => {
                    this.invalidate(dir);
                };

                const cleanup = () => {
                    trigger();

                    if (watchers.get(dir) === watcher) {
                        watchers.delete(dir);
                        watcher.removeAllListeners();
                        watcher.close();
                    }
                };

                watcher.on("change", trigger);
                watcher.on("error", cleanup);
                watcher.on("close", cleanup);
                watchers.set(dir, watcher);
            }

            const x = this.get(dir);
            const y = await scan(dir);
            if (Object.isFrozen(x)) {
                break;
            }

            if (diff(x, y)) {
                changes = true;

                if (x) {
                    y ? changed.push([x, y]) : removed.push(x);
                }

                if (y) {
                    x || added.push(y);
                    this.set(dir, y);
                } else {
                    this.delete(dir);

                    const watcher = watchers.get(dir);
                    if (watcher) {
                        watchers.delete(dir);
                        watcher.close();
                    }
                }

                for (const dir of compare(x, y)) {
                    queue.add(dir);
                }
            }
        }

        return changes ? result : false;
    }

    async watch(stableDelay: number, cb: (result: SyncResult | null) => any) {
        const result = await this.sync();
        result && cb(result);

        while (await this.wait()) {
            while (stableDelay && this.block()) {
                let timer: any;
                const done = () => {
                    if (timer !== undefined) {
                        this.trigger();
                        clearTimeout(timer);
                        timer = undefined;
                    }
                };

                timer = setTimeout(done, stableDelay);
                await this.wait();

                if (timer === undefined) {
                    break;
                }

                clearTimeout(timer);
                timer = undefined;
            }

            const result = await this.sync();
            result && cb(result);
        }

        cb(null);
    }

    close() {
        const { pulse, roots, watchers } = this;
        if (pulse) {
            pulse(false);
        }

        for (const watcher of watchers.values()) {
            watcher.removeAllListeners();
            watcher.close();
        }

        roots.clear();
        watchers.clear();
        this.clear();

        this.pulse = undefined;
        this.promise = _false;
        
        Object.freeze(this);
    }
}

export default FileSystemCache;
