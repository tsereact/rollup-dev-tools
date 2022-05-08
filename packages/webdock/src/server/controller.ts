import type { HMR } from "../ipc/Message";
import type { Readable, Writable } from "stream";

import Screen from "./Screen";
import server from "../ipc/server";

const hmrStates = new Map<string, HMR.Publish>();
const screenStates = new Map<string, Screen>();

function screenOf(name: string) {
    let screen = screenStates.get(name);
    if (screen === undefined) {
        screenStates.set(name, screen = new Screen());

        const names = [...screenStates.keys()].sort();
        server.replyAll({  channel: "screen-advertise", names });
    }

    return screen;
}

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

server.on("screen-subscribe", (msg, port) => {
    const { name } = msg;
    const screen = screenOf(name);
    server.observe(port, "hmr-publish", true);
    server.observe(port, "screen-advertise", true);
    server.observe(port, `screen-update-${name}`);

    const names = [...screenStates.keys()].sort();
    const lines = [...screen];
    server.replyOne({ channel: "screen-advertise", names }, port);
    server.replyOne({ channel: `screen-update-${name}`, reset: true, lines }, port);    
});

namespace controller {
    export function writeScreen(name: string, reader: Readable, writer?: Writable) {
        const bufs = [] as string[];
        const screen = screenOf(name);
        reader.setEncoding("utf-8");
        reader.on("data", (data: string) => {
            bufs.push(data);

            if (data.indexOf("\n") >= 0) {
                const lines = bufs.join("").split("\n");
                bufs.length = 0;
                bufs.push(lines.pop()!);

                const reset = screen.append(lines);
                server.replyAll({ channel: `screen-update-${name}`, reset, lines: screen.take() });

                if (writer) {
                    for (const line of lines) {
                        writer.write(line);
                    }
                }
            }
        });
    }
}

export default controller;