import { createHash } from "crypto";
import { isAbsolute, normalize, relative, resolve } from "path";

const rx = /[\\/]+/g;

export function cwd() {
    return slashify(normalize(process.cwd() + "/"));
}

export function pathToName(path: string) {
    if (path[0] === "\0") {
        return path;
    }
    
    path = slashify(path);

    const prefix = "/node_modules/";
    const index = path.indexOf(prefix);
    if (index >= 0) {
        const tail = path.substring(index + prefix.length);
        return "npm:" + tail;
    }

    const base = cwd();
    if (path.startsWith(base)) {
        return path.substring(base.length);
    }

    return path;
}

export function hashIt(...args: any[]) {
    args = args.map(x => JSON.stringify(x) || "undefined")

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

export function slashify(value: string) {
    return value.replace(rx, "/");
}
