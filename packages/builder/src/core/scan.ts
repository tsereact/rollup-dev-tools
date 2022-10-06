import { normalize } from "path";
import { slashify } from "./ref";

import fs from "fs/promises";
import GlobSet, { GlobInit } from "./GlobSet.js";

export type ScanResult = [root: string, files: string[]];

function scan(root: string, ...filter: GlobInit[]): Promise<string[]>;
function scan(roots: string[], ...filter: GlobInit[]): Promise<ScanResult[]>;

async function scan(roots: string | string[], ...filter: GlobInit[]) {
    let single = false;
    if (typeof roots === "string") {
        roots = [roots];
        single = true;
    }

    roots = roots.map(x => slashify(normalize(x + "/")));

    const mask = GlobSet.create(...filter);
    const prefix = mask.prefix();
    const queue = new Set(roots);
    roots.forEach(x => queue.add(x + prefix));

    const results: ScanResult[] = roots.map(x => [x, []]);
    for (const dir of queue) {
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            const fn = `${dir}${entry.name}`;
            if (entry.isDirectory()) {
                queue.add(fn);
            }

            if (entry.isFile()) {
                for (const [root, list] of results) {
                    if (fn.startsWith(root)) {
                        list.push(fn.substring(root.length));
                    }
                }
            }
        }
    }

    if (single) {
        return results[0][1];
    }

    return results;
}

export default scan;
