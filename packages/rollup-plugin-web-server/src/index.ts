import type { Plugin } from "rollup";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { lookupService } from "dns/promises";
import connect, { Server } from "connect";
import serve from "./serve";

let setupConnect: Promise<Server> | undefined;
let setupListen: Promise<string> | undefined;
let block: Promise<void> | undefined;
let unblock = () => {};

const main = {};
const configures = [] as Configure[];
const locks = new Set<any>();

function wait() {
    if (locks.size && block === undefined) {
        block = new Promise<void>(resolve => {
            unblock = () => {
                block = undefined;
                resolve();
            };
        });
    }

    return block;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    while (locks.size || !setupConnect) {
        await wait();

        if (!setupConnect) {
            const list = [...configures];
            configures.length = 0;

            const setup = async () => {
                const result = connect();
                for (const configure of list) {
                    await configure(result);
                }

                result.use(serve.error());
                result.use(serve.notFound());

                return result;
            };

            setupConnect = setup();
            await setupConnect;
        }
    }

    (await setupConnect)(req, res);
}

interface Configure {
    (connect: Server): Promise<void> | void;
}

function webServer(configure?: Configure): Plugin | false {
    if (process.env.ROLLUP_WATCH !== "true") {
        return false;
    }

    const dirs = [] as string[];
    if (configure === undefined) {
        configure = connect => dirs.forEach(x => connect.use(serve.files(x, "/")));
    }

    webServer.listen();
    webServer.configure(configure);

    let lock: any;
    return {
        name: "web-server",

        buildEnd() {
            dirs.length = 0;
            locks.add(lock = {});
        },

        renderStart(opts) {
            opts.dir && dirs.push(opts.dir);
        },
        
        async closeBundle() {
            locks.delete(lock);
            locks.delete(main);

            if (locks.size < 1) {
                unblock();

                if (configures.length > 0) {
                    setupConnect = undefined;
                }

                const port = await setupListen;
                console.log("WebServer: %s", port);
            }
        }
    };
}

namespace webServer {
    export function configure(fn: (connect: Server) => any) {
        if (process.env.ROLLUP_WATCH !== "true") {
            return false;
        }

        locks.add(main);
        configures.push(fn);

        return true;
    }

    export async function listen(port = 8780, host = "localhost") {
        if (process.env.ROLLUP_WATCH !== "true") {
            return "";
        }

        if (setupListen) {
            return setupListen
        }

        const setup = async () => {
            let fqdn = host;
            if (host === "*") {
                const { hostname } = await lookupService("0.0.0.0", 0);
                fqdn = hostname;
            }

            const server = createServer();
            server.on("request", handleRequest);

            const promise = new Promise<string>(resolve => {
                server.on("listening", () => {
                    const addr = server.address();
                    if (addr && typeof addr === "object") {
                        resolve(`http://${fqdn}:${addr.port}/`);
                    } else {
                        resolve(`http://${fqdn}:${port}/`);
                    }
                });    
            })

            server.on("error", err => {
                console.warn("[WebServer]: Could not listen on %s:%s [ERROR: %s]", host, port, err.message);
                server.removeAllListeners("error");

                server.listen(port, host !== "*" ? host : undefined);
            });

            server.listen(port, host !== "*" ? host : undefined);
            return promise;
        };

        return setupListen = setup();
    }
}

export { serve };
export default webServer;
