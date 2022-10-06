import { readFile } from "fs/promises";
import { Plugin } from "rollup";
import { makeModuleId, pathToName } from "../core/ref";

import { descend } from "../rollup-tools/walk";
import { isAbsolute } from "path";

import GlobSet, { GlobInit } from "../core/GlobSet";

export interface RenderContext {
    base: string;
    target: string;

    code(id?: string): string;
    resolveEntry(name?: string): string;
    resolveModules(...filters: GlobInit[]): string[];

    escapeCode(code: string): string;
    importAsScript(base: string, ...imports: (string | string[])[]): string;
    jsAsScript(code: string): string;
    makeRelative(base: string, to: string): string;
    replace(html: string, token: string, ...values: (string | string[])[]): string;
}

function renderDefault(html: string, ctx: RenderContext): Promise<string> | string {
    const code = ctx.code();
    html = ctx.replace(html, "{CODE}", ctx.jsAsScript(code));

    return html;
}

export function emitHtml(templateFile: string, render = renderDefault): Plugin {
    return {
        name: "emit-html",

        async generateBundle(_, bundle) {
            const ctx = this;
            const html = await readFile(templateFile, "utf-8");
            render(html, {
                base: ".",
                target: "index.html",

                code(id?: string) {
                    if (id) {
                        const chunk = bundle[id];
                        if (chunk.type === "chunk") {
                            return chunk.code;
                        }
                    }

                    for (const key in bundle) {
                        const chunk = bundle[key];
                        if (chunk.type === "chunk" && chunk.isEntry) {
                            return chunk.code;
                        }
                    }

                    return "";
                },

                resolveEntry(name?: string) {
                    for (const key in bundle) {
                        const chunk = bundle[key];
                        if (chunk.type === "chunk" && chunk.isEntry) {
                            if (name === name || name === undefined) {
                                return key;
                            }
                        }
                    }

                    return "";
                },

                resolveModules(...filters) {
                    function isSource(id: string) {
                        id = pathToName(id);
                    
                        if (isAbsolute(id) || id[0] === "\0") {
                            return false;
                        }
                    
                        return true;
                    }

                    const filter = GlobSet.create(...filters);
                    const map = new Map<string, string>();
                    const seeds = new Set<string>();
                    for (const key in bundle) {
                        const chunk = bundle[key];
                        if (chunk.type === "chunk") {
                            let any = false;
                            for (const id in chunk.modules) {
                                map.set(id, chunk.fileName);

                                if (isSource(id) && filter.match(id)) {
                                    any = true;
                                }
                            }

                            if (any) {
                                for (const id in chunk.modules) {
                                    seeds.add(id);
                                }
                            }
                        }
                    }

                    const result = new Set<string>();
                    descend(ctx, seeds, id => result.add(map.get(id) || ""));

                    return [...result].filter(x => !!x);
                },

                escapeCode(code: string) {
                    return code.replace(/<\//g, "<\\/");
                },

                importAsScript(base: string, ...imports: (string | string[])[]) {
                    let list = imports.flat();
                    list = list.map(x => this.makeRelative(base, x));
                    list = list.map(x => this.escapeCode(JSON.stringify(x)));
                    list = list.map(x => ["import(", x, ");"]).flat();

                    return `<script type="module">${list.join("")}</script>`;
                },

                jsAsScript(code: string) {
                    const htmlJs = this.escapeCode(code);
                    return `<script type="module">${htmlJs}</script>`;
                },

                makeRelative(base: string, to: string) {
                    return makeModuleId(base, to);
                },

                replace(html: string, token: string, ...values: (string | string[])[]) {
                    const lines = html.split(/\r?\n/);
                    const flat = values.flat();
                    const result = lines.map(value => {
                        if (value.indexOf(token) < 0) {
                            return value;
                        }

                        return flat.map(x => value.replace(token, x));
                    });

                    return result.flat().join("\n");
                }
            });
        }
    };
}

export default emitHtml;
