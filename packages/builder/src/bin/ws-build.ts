import { spawn } from "child_process";
import { captureScreen, registerProject, start, waitForProjects } from "../core/ipcMain";
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

async function main() {
    let next: string[] | Set<string> | undefined;
    const argv: string[] = [];
    const host: string[] = [];
    const port: string[] = [];
    const include = new Set<string>();
    const exclude = new Set<string>();    
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

                default:
                    include.add(arg);
                    break;
            }
        }
    }

    const ws = await scanForPackages();
    if (!include.size) {
        ws.forEach(x => x.name && include.add(x.name));
    }

    const info: string[] = [];
    const map = arrange(ws.values(), include, exclude);
    for (const pkg of map.keys()) {
        info.push(pkg.name);
    }

    const listenPort = await start({
        port: port.length ? Number(port.pop()) : undefined,
        host: host.length ? host.pop() : undefined,
    });

    console.log("Projects:", info.join(", "));
    console.log("     IPC: Listening on port [ %s ]", listenPort);

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
}

main();
