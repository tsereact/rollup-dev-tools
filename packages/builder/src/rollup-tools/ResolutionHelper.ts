import GlobSet, { GlobInit } from "../core/GlobSet";

import { isAbsolute } from "path";
import { builtinModules } from "module";
import { pathToName } from "../core/ref";
import { ResolvedId, ResolveIdResult } from "rollup";

const builtins = new Set([
    ...builtinModules,
    ...builtinModules.map(x => "node:" + x),
    "electron"
].sort());

const relx = /^\.?\.\//;

interface Resolved {
    readonly result: ResolvedId | null;
    readonly target: string;
}

class ResolutionHelper {
    readonly id: string;
    readonly importer?: string;
    readonly result?: ResolvedId | null;
    readonly target?: string;

    constructor(id: string, importer?: string, result?: ResolvedId | null, target?: string) {       
        this.id = id;
        this.importer = importer;
        this.result = result;
        this.target = target;
    }

    toString() {
        return this.id;
    }

    isNative() {
        const { id } = this;
        if (builtins.has(id)) {
            return true;
        }
    
        if (id.startsWith("electron/")) {
            return true;
        }
    
        return false;
    }

    isRelative() {
        const { id } = this;
        return relx.test(id);
    }

    isResolved(...filters: GlobInit[]): this is ResolutionHelper & Resolved {
        const { result, target } = this;
        if (result === undefined) {
            return false;
        }

        if (!filters.length) {
            return true;
        }

        if (!result || !target || result.external || !isAbsolute(target)) {
            return false;
        }

        const name = pathToName(target);
        if (isAbsolute(name) || name[0] === "\0") {
            return false;
        }

        const filter = GlobSet.create(...filters);
        return filter.match(name);
    }

    isSourceRef(...filters: GlobInit[]) {
        const { importer } = this;
        if (importer === undefined) {
            return !filters.length;
        }

        if (!isAbsolute(importer)) {
            return false;
        }

        const name = pathToName(importer);
        if (name.startsWith("npm:") || name === "\0") {
            return false;
        }

        if (!filters.length) {
            return true;
        }

        if (isAbsolute(name)) {
            return false;
        }

        const filter = GlobSet.create(...filters);
        return filter.match(name);
    }

    default(): ResolveIdResult | undefined {
        if (this.isResolved()) {
            return this.result;
        }

        if (this.isNative()) {
            return this.external();
        }
    }

    external(id = this.id, external: boolean | "absolute" | "relative" = true): ResolveIdResult {
        return { id, external };
    }

    hoist(): ResolveIdResult {
        const tail = JSON.stringify([this.id, this.importer]);
        return { id: "\0hoist?" + tail, syntheticNamedExports: "__exports" };
    }

    link(facet: string): ResolveIdResult | undefined {
        const { result, target } = this;
        if (!result || !target || result.external || !isAbsolute(target)) {
            return undefined;
        }

        const tail = JSON.stringify([target, facet, this.importer]);
        return { id: `\0link?${tail}`, syntheticNamedExports: "__exports" };
    }
}

export default ResolutionHelper;
