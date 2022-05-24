import type { Dirent } from "fs";
import fs from "fs/promises";
import path from "path";

async function syncDevDeps(...dirs: string[]) {
    if (dirs.length < 1) {
        dirs.push("experiments", "packages");
    }

    const queue = new Set<string>();
    for (const dir of dirs) {
        queue.add(path.resolve(dir));
    }

    let list: Dirent[] = [];
    const { devDependencies: deps } = JSON.parse(await fs.readFile("package.json", "utf-8"));    
    for (const dir of queue) {
        list = [];

        try {
            list = await fs.readdir(dir, {
                withFileTypes: true
            });

            const fn = path.resolve(dir, "package.json");
            const json = JSON.parse(await fs.readFile(fn, "utf-8"));
            const { devDependencies, peerDependencies, ...rest } = json;
            Object.assign(rest, { devDependencies: deps });
            await fs.writeFile(fn, JSON.stringify(rest, undefined, 4));
        } catch {
            // don't care
        }

        for (const entry of list) {
            if (entry.isDirectory()) {
                queue.add(path.resolve(dir, entry.name));
            }
        }
    }
}

export default syncDevDeps;
