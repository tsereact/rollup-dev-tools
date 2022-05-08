import { HMR } from "../ipc/Message";
import server from "../ipc/server";

const hmrStates = new Map<string, HMR.Publish>();
const screenStates = new Map<string, string[]>();

server.on("hmr-announce", (msg, port) => {
    const { id } = msg;
    server.observe(port, `hmr-publish`);

    const state = hmrStates.get(id);
    state && server.replyOne(msg, port);
});

server.on("hmr-publish", msg => {
    const state = hmrStates.get(msg.id);
    if (!state || state.gen < msg.gen) {
        hmrStates.set(msg.id, msg);
        server.replyAll(msg);
    }
});
