import { spawn, spawnSync } from "child_process";
import { resolve } from "path";
import { captureScreen, registerProject, start, waitForProjects } from "../core/ipcMain";
import { relativeStrict } from "../core/ref";
import { Manifest, scanForPackages } from "../core/scan";

function arrange(ws: Iterable<Manifest>, include: Set<string>, exclude: Set<string>) {
    const result = new Map<Manifest, string[]>();
    const avoid = new Set<Manifest>();
    const stack: (() => void)[] = [];
    const next = (pkg: Manifest) => {
        if (!avoid.has(pkg) && !exclude.has(pkg.name)) {
            avoid.add(pkg);

            stack.push(() => {
                const refs = pkg.refs.filter(x => !exclude.has(x.name));
                result.set(pkg, refs.map(x => x.name));
            });

            for (const ref of pkg.refs) {
                stack.push(() => next(ref));
            }
        }
    };

    const queue = new Set(ws);
    for (const root of queue) {
        if (include.has(root.name)) {
            stack.push(() => next(root));

            let action: (() => void) | undefined;
            while (action = stack.pop()) {
                action();
            }
        }
    }

    return result;
}

function test(manifest: Manifest, hints: string[]) {
    const { tags } = manifest;
    for (const hint of hints) {
        if (hint === manifest.name) {
            return true;
        }

        if (tags.indexOf(hint) >= 0) {
            return true;
        }

        const base = resolve(hint);
        if (manifest.path === base || relativeStrict(base, manifest.path)) {
            return true;
        }
    }

    return false;
}

async function main() {
    let next: string[] | Set<string> | undefined;
    let watch = false;
    const argv: string[] = [];
    const host: string[] = [];
    const port: string[] = [];
    const exclude = new Set<string>();    
    const include = new Set<string>();
    const startup: string[] = [];
    const [,, ...cmdline] = process.argv;
    for (const arg of cmdline) {
        if (next) {
            next instanceof Set ? next.add(arg) : next.push(arg);

            if (next !== argv) {
                next = undefined;
            }
        } else {
            switch (arg) {
                case "-p":
                    next = port;
                    break;

                case "-h":
                    next = host;
                    break;

                case "-e":
                    next = exclude;
                    break;

                case "-c":
                    next = argv;
                    break;

                case "--watch":
                    watch = true;
                    break;

                default:
                    startup.push(arg);
                    break;
            }
        }
    }

    const ws = await scanForPackages();
    if (startup.length) {
        ws.forEach(x => {
            if (x.name && test(x, startup)) {
                include.add(x.name);
            }
        });
    } else {
        const base = resolve();
        ws.forEach(x => {
            if (x.name && (x.path === base || relativeStrict(base, x.path))) {
                include.add(x.name);
            }
        });
    }

    const info: string[] = [];
    const map = arrange(ws.values(), include, exclude);
    for (const pkg of map.keys()) {
        info.push(pkg.name);
    }

    console.log("Projects:", info.join(", "));

    if (watch) {
        const listenPort = await start({
            port: port.length ? Number(port.pop()) : undefined,
            host: host.length ? host.pop() : undefined,
        });
    
        console.log("     IPC: Listening on port [ %s ]", listenPort);
        console.log();

        captureScreen();

        for (const [pkg, deps] of map) {
            if (deps.length) {
                console.log("%s: Waiting on [ %s ]", pkg.name, deps.join(", "));
                await waitForProjects(deps);    
            }

            const done = (error?: Error, code?: any) => {
                if (error) {
                    console.log("%s: Exited. [ error = %s ]", pkg.name, error.message);
                }

                if (code !== undefined) {
                    console.log("%s: Exited. [ code = %s ]", pkg.name, code);
                }

                registerProject({}, pkg.name);
            };

            console.log("%s: Starting...", pkg.name);
            const child = spawn(process.env.npm_execpath || "npm", ["watch", ...argv], {
                cwd: pkg.path,
                shell: true,
                stdio: ["ignore", "pipe", "pipe"],
            });

            child.on("error", error => done(error));
            child.on("exit", code => done(undefined, code));

            const { stdout, stderr } = child;
            stdout.pipe(process.stdout);
            stderr.pipe(process.stdout);
        }
    } else {
        for (const [pkg] of map) {
            try {
                const code = spawnSync(process.env.npm_execpath || "npm", ["build", ...argv], {
                    cwd: pkg.path,
                    shell: true,
                    stdio: "inherit",
                });

                console.log("%s: Exited. [ code = %s ]", pkg.name, code);
            } catch (error: any) {
                console.log("%s: Exited. [ error = %s ]", pkg.name, error.message);
            }
        }
    }
}

main();
