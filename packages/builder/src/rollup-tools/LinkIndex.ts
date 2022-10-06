import { mkdir, readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { makeModuleId } from "../core/ref";

export interface LinkState {
    chunk: string;
    facet: string;
    target: string;
}

class LinkIndex extends Map<string, LinkState> {
    dir: string;
    file: string;

    constructor(...dirs: string[]) {
        super();
        this.dir = resolve(...dirs);
        this.file = resolve(this.dir, "link.json");
    }

    async read() {
        this.clear();

        const content = await readFile(this.file, "utf-8").catch(() => "");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            if (line[0] === "[") {
                try {
                    const array = JSON.parse(line);
                    if (Array.isArray(array) && array.every(x => typeof x === "string") && array.length === 4) {
                        const [name, target, facet, chunk] = array;
                        this.set(name, { chunk, facet, target });
                    }
                } catch {
                    // don't care
                }
            }
        }

        for (const { chunk } of this.values()) {
            if (!chunk) {
                return true;
            }
        }

        return false;
    }

    async write() {
        await mkdir(this.dir, { recursive: true });
        await writeFile(this.file, this.toString());
    }

    add(name: string, target: string, facet: string) {
        let chunk = "";
        const entry = this.get(name);
        if (entry !== undefined) {
            chunk = entry.chunk;
        }

        target = makeModuleId(this.dir, target);
        this.set(name, { chunk, facet, target });

        return !chunk;
    }

    resolve(name: string) {
        const entry = this.get(name);
        if (entry) {
            const { chunk } = entry;
            if (chunk) {
                return resolve(this.dir, chunk);
            }
        }

        return false;
    }

    toString() {
        const lines: string[] = [];
        for (const [key, { target, facet, chunk }] of this) {
            const line = [key, target, facet, chunk];
            const json = JSON.stringify(line);
            lines.push(json);
        }

        return lines.join("\n");
    }
}

export default LinkIndex;
