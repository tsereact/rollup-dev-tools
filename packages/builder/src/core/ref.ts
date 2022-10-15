import { createHash } from "crypto";
import { isAbsolute, parse, relative, resolve } from "path";

const relx = /^\.\.?[\\/]/;
const slashx = /[\\/]+/g;

export function pathToName(path: string) {
    if (path[0] === "\0") {
        return path;
    }
    
    const safe = slashify(path);
    const prefix = "/node_modules/";
    const index = safe.indexOf(prefix);
    if (index >= 0) {
        const tail = safe.substring(index + prefix.length);
        return "npm:" + tail;
    }

    const result = relativeStrict(resolve(), path);
    if (result) {
        return result;
    }

    const { PROJECT_CWD } = process.env;
    if (PROJECT_CWD) {
        const result = relativeStrict(PROJECT_CWD, path);
        if (result) {
            return "ws:" + result;
        }    
    }

    return path;
}

export function hashIt(...args: any[]) {
    args = args.map(x => typeof x === "bigint" ? String(x) : (JSON.stringify(x) || "undefined"));

    const hasher = createHash("sha256");
    hasher.update(args.join("\n"));
    return hasher.digest("hex");
}

export function short(...args: any[]) {
    return hashIt(...args).substring(0, 8);
}

export function tag(dir: string, target: string, ...args: any[]) {
    target = makeModuleId(dir, target);
    return short(target, ...args);
}

export function makeModuleId(dir: string, target: string) {
    dir = resolve(dir);
    target = resolve(target);
    target = relative(dir, target);

    if (isAbsolute(target)) {
        return target;
    }
    
    target = slashify(target);

    if (target.startsWith("../")) {
        return target;
    }

    return "./" + target;
}

export function relativeStrict(from: string, to: string) {
    to = relative(from, to);

    if (isAbsolute(to)) {
        return "";
    }

    if (relx.test(to)) {
        return "";
    }

    return slashify(to);
}

export function entryName(...parts: string[]) {
    const { dir, name } = parse(parts.join("/"));
    return slashify(`${dir}/${name}`).replace(/(^[\\/]+|[\\/]+$)/g, "");
}

export function slashify(value: string) {
    return value.replace(slashx, "/");
}
