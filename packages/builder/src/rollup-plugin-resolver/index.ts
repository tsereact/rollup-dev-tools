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
                return { id, syntheticNamedExports: "__exports" };
            }

            if (id.startsWith("\0hoist?")) {
                return { id, syntheticNamedExports: "__exports" };
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
                const [target] = JSON.parse(tail) as string[];
                const code = [
                    `export const __exports = Object.create(require(${JSON.stringify(target)}));`,
                    `Object.assign(__exports, { default: __exports, __esModule: !0 });`,
                ];

                return code.join("\n");
            }

            return undefined;
        },
    };
}

export default resolver;
