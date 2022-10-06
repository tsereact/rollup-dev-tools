import type { Plugin } from "rollup";
import { ChildProcess, fork, ForkOptions, spawn, SpawnOptions } from "child_process";

export interface State extends Array<any> {
    error?: Error;
    restart?: boolean;
}

export interface CallbackFunc {
    (process: ChildProcess, state: State): any;
}

export interface CommonOptions {
    kill?: boolean | CallbackFunc;
    monitor?: CallbackFunc;
    restart?: boolean | CallbackFunc;
    when?: "build" | "watch";
}

export interface ForkBasedOptions extends CommonOptions {
    fork: string;
    options?: ForkOptions;
}

export interface SpawnBasedOptions extends CommonOptions {
    spawn: string;
    options?: SpawnOptions;
}

function execute(cmd: ForkBasedOptions | SpawnBasedOptions): ChildProcess {
    if ("fork" in cmd) {
        const { fork: modulePath, options } = cmd;
        return fork(modulePath, options || {});
    }

    const { spawn: cmdline, options } = cmd;
    return spawn(cmdline, options || {});
}

function make(cmd: string | ForkBasedOptions | SpawnBasedOptions) {
    if (typeof cmd === "string") {
        cmd = { spawn: cmd };
    }

    const { kill } = cmd;
    if (kill !== false && typeof kill !== "function") {
        cmd = { ...cmd, kill: x => x.kill("SIGTERM") };
    }

    const { restart } = cmd;
    if (restart !== false && typeof restart !== "function") {
        cmd = { ...cmd, restart: (x, y) => x.exitCode === 251 || y.restart };
    }

    return cmd;
}

function run(cmd: string | ForkBasedOptions | SpawnBasedOptions): Plugin | false {
    cmd = make(cmd);

    const { when } = cmd;
    if (!when || when === "watch") {
        if (process.env.ROLLUP_WATCH !== "true") {
            return false;
        }
    }

    let active: any;
    let shutdown = async () => {};
    const { kill, monitor, restart } = make(cmd);
    const start = () => {
        const state: State = active = [];
        const process = execute(make(cmd));
        const disconnected = new Promise<void>(resolve => {
            if (process.connected) {
                process.on("disconnect", resolve);
            } else {
                resolve();
            }
        });

        if (typeof monitor === "function") {
            monitor(process, state);
        }

        const exited = new Promise<void>(resolve => {
            process.on("exit", resolve);
            process.on("error", error => {
                state.error = error;
                resolve();

                console.log("Command error: %s [ err = %s ]", cmd, error.message);
            });
        });

        const observe = async () => {
            await exited;
            await disconnected;

            if (active === state) {
                active = undefined;

                if (typeof restart === "function" && restart(process, state)) {
                    start();
                }
            }
        };

        let killed = false;
        const promise = observe();
        shutdown = async () => {
            if (active === state) {
                active = undefined;
            }

            if (typeof kill === "function") {
                if (!killed) {
                    killed = true;
                    kill(process, state);
                }

                await promise;
            }
        };
    };

    return {
        name: "run",

        async generateBundle() {
            kill && await shutdown();
        },

        closeBundle() {
            active || start();
        }
    };
}

export default run;
