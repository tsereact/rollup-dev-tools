import type { ModuleInfo, Plugin, ResolvedId } from "rollup";
import fs from "fs/promises";
import path, { relative } from "path";

function slashify(value: string) {
    return value.replace(/[\\/]+/g, "/");
}

function vendorOf(id: string) {
    if (id[0] === "\0") {
        return false;
    }

    id = slashify(id);
    
    const [, suffix] = id.split("/node_modules/");
    if (suffix) {
        const [scope, name] = suffix.split("/");
        if (scope && scope[0] !== "@") {
            return scope;
        }

        if (name) {
            return `${scope}/${name}`;
        }
    }

    return false;
}

function vendorsVia(info: ModuleInfo) {
    function filter(resos: readonly ResolvedId[]) {
        return resos.filter(x => x.external === true).map(x => vendorOf(`/node_modules/${x.id}`));
    }

    return new Set([
        ...info.dynamicallyImportedIds.map(vendorOf),
        ...info.importedIds.map(vendorOf),
        ...filter(info.dynamicallyImportedIdResolutions),
        ...filter(info.importedIdResolutions),
    ]);
}

function addKeys(deps: unknown, keys: Set<string>) {
    if (deps && typeof deps === "object" && !Array.isArray(deps)) {
        for (const key in deps) {
            keys.add(key);
        }
    }
}

/**
 * Attempts to find usages of packages not explicitly referenced in dependencies.
 */
function checkImports(): Plugin {
    const vendors = new Set<string>();
    return {
        name: "check-imports",

        async buildStart() {
            vendors.clear();

            let last: any;
            let dir = process.cwd();
            while (dir !== last) {
                try {
                    const fn = path.join(dir, "package.json");
                    const packageJson = await fs.readFile(fn, "utf-8");
                    const { dependencies, devDependencies, peerDependencies } = JSON.parse(packageJson);
                    addKeys(dependencies, vendors);
                    addKeys(devDependencies, vendors);
                    addKeys(peerDependencies, vendors);
                } catch {
                    // don't care
                }
                
                last = dir;
                dir = path.dirname(dir);
            }
        },

        moduleParsed(info) {
            if (info.id[0] !== "\0" && !vendorOf(info.id)) {
                for (const vendor of vendorsVia(info)) {
                    if (vendor && !vendors.has(vendor)) {
                        const importer = slashify(relative(process.cwd(), info.id));
                        this.warn(`${importer} uses ${vendor}: Fix code or add the package.`);
                    }
                }
            }
        }
    };
}

export default checkImports;