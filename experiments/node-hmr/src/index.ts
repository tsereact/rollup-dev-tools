import hmr from "@tsereact/rollup-dev-tools/plugin-hmr/state"
import { createServer, Server } from "http";

interface ModuleState {
    promise?: Promise<void>;
    server?: Server;
}

function init() {
    const state: ModuleState = {};
    if (hmr) {
        Object.assign(state, hmr.state);
        hmr.state = state;
        hmr.onUpdate("import");
    }

    if (!state.server) {
        console.log("createServer()");

        const server = state.server = createServer();       
        server.listen(8180);
    }

    const { server } = state;
    server.removeAllListeners();
    server.on("request", (_, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.write("HMR = " + hmr?.hash);
        res.end();
    });

    console.log("loaded", hmr?.hash);
    console.log("change this");
}

hmr && hmr.ready && init();
hmr || init();
