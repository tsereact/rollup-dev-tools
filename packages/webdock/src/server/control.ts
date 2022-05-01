import { spawn, ChildProcess } from "child_process";
import http from "http";

import app from "./app";
import screen from "./screen";

const processes = new Map<string, ChildProcess>();
const servers = new Map<string, http.Server>();

export async function httpListen(name: string, port: number, host: string) {
    const server = http.createServer();
    server.listen(port, host);
    server.on("request", app);

    servers.set(name, server);
}

export async function spawnProcess(name: string, shell: boolean, cwd: string, cmd: string, args?: string[]) {
    const env = {  };
    const extras = [] as any[];
    args && extras.push(args);
    extras.push({ stdio: "pipe", cwd, env, shell });

    const child = spawn(cmd, ...extras);
    child.stdin.end();

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", x => screen.push(x));
    child.stdout.pipe(process.stdout);
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", x => screen.push(x));
    child.stderr.pipe(process.stderr);

    processes.set(name, child);
}

export default spawn;
