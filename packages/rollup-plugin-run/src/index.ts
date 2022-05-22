import type { Plugin } from "rollup";
import { ChildProcess, spawn } from "child_process";

interface Options {
    exec: string;
    kill?: boolean;
    restart?: boolean;
    when?: "build" | "watch";
}

function run(cmd: string | Options): Plugin | false {
    if (typeof cmd === "string") {
        cmd = { exec: cmd };
    }

    const { exec, kill, restart, when } = cmd;

    if (!when || when === "watch") {
        if (process.env.ROLLUP_WATCH !== "true") {
            return false;
        }
    }

    let child: ChildProcess | undefined;
    let promise: Promise<number> | undefined;
    const start = () => {
        const process = child = spawn(exec, {
            shell: true,
            stdio: "inherit",
        });

        promise = new Promise<number>(resolve => {
            process.on("exit", resolve);
            process.on("error", err => {
                resolve(252);
                console.log("Command error: %s [err = %s]", cmd, err.message);
            });
        });

        promise.then(x => {
            if (x === 251 && restart) {
                start();
            } else {
                child = undefined;
            }
        });
    };

    return {
        name: "run",

        async buildStart() {
            if (kill !== false) {
                child?.kill();
                await promise;
            }
        },
        
        closeBundle() {
            !child && start();
        }
    };
}

export default run;
