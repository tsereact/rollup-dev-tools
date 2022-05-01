import type { Plugin } from "rollup";
import { ChildProcess, spawn } from "child_process";

function run(cmd: string): Plugin | false {
    if (process.env.ROLLUP_WATCH === "true") {
        return false;
    }

    let child: ChildProcess | undefined;
    let promise: any;
    return {
        name: "run",

        async buildStart() {
            child?.kill();
            await promise;
        },
        
        closeBundle() {
            const process = child = spawn(cmd, {
                shell: true,
                stdio: "inherit",
            });

            promise = new Promise(x => {
                process.on("exit", x);
                process.on("error", err => {
                    console.log("Command error: %s [err = %s]", cmd, err.message);
                });
            });
        }
    };
}

export default run;
