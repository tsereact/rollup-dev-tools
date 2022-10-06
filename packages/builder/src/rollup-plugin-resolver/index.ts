import { Plugin, ResolveIdResult } from "rollup";
import { tag } from "../core/ref";

import ResolutionHelper from "../rollup-tools/ResolutionHelper";

const jsonx = /^.*?\?/;
const prefix = "__prebuilt$$";

export interface Callback {
    (resolver: ResolutionHelper): ResolveIdResult | Promise<ResolveIdResult>;
}

function resolver(callback: Callback): Plugin {
    return {
        name: "resolver",

        async resolveId(id, importer, opts) {
            if (id.startsWith("\0link?")) {
                return id;
            }

            if (id.startsWith("\0hoist?")) {
                return id;
            }

            const preflight = await callback(new ResolutionHelper(id, importer));
            if (preflight !== undefined) {
                return preflight;
            }

            const result = await this.resolve(id, importer, { ...opts, skipSelf: true });
            const postflight = await callback(new ResolutionHelper(id, importer, result, result?.id));
            return postflight !== undefined ? postflight : result;
        },

        async load(id) {
            if (id.startsWith("\0link?")) {
                const tail = id.replace(jsonx, "");
                const [target, facet] = JSON.parse(tail) as string[];
                const hash = tag(".", target, facet);
                return `export const __exports = ${prefix}${hash};`;
            }

            if (id.startsWith("\0hoist?")) {
                const tail = id.replace(jsonx, "");
                const [target, state] = JSON.parse(tail) as string[];
                const input = JSON.stringify(state) || "undefined";
                const code = [
                    `import __import from ${JSON.stringify(target)};`,
                    `export const __exports = await __import(${input});`,
                ];

                return code.join("\n");
            }

            return undefined;
        },
    };
}

export default resolver;
