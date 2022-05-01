import type { Plugin } from "rollup";

type PluginKeys = Exclude<keyof Plugin, "name" | "api">;

/**
 * Attempts to find usages of packages not explicitly referenced in dependencies.
 */
function observe<K extends PluginKeys>(key: K, fn: Plugin[K]): Plugin {
    return { name: "delegate", [key]: fn };
}

export default observe;
