import { HMR } from "../Message";
import server from "../server";

const states = new Map<string, HMR.Notify>();

server.on("hmr-announce", (msg, port) => {
    const { id } = msg;
    server.observe(port, `hmr-publish-${id}`);

    const state = states.get(id);
    state && server.replyOne(msg, port);
});

server.on("hmr-publish", msg => {
    const { id, chunk, gen } = msg;
    const state = states.get(id);
    if (!state || state.gen < gen) {
        const state: HMR.Notify = { channel: `hmr-notify-${id}`, chunk, gen};
        states.set(id, state);
        server.replyAll(state);
    }
});
