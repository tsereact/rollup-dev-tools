import hmr from "@tsereact/builder/rollup-plugin-hmr/state";
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
        console.info("createServer()");

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

    console.info("loaded", hmr?.hash);
    console.info("change this --- test");
}

hmr && hmr.ready && init();
hmr || init();
