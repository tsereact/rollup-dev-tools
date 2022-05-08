import type { Dispatch, Message } from "./Message";

const backlog = [] as Message[];

const map = new Map<string, [any, (msg: Message) => any][]>();
let enable = () => {};
let disable = () => {};
let send: (msg: Message) => any = backlog.push.bind(backlog);

function push(sender: typeof send) {
    send = sender;

    for (const msg of backlog) {
        send(msg);
    }

    backlog.length = 0;
}

function dispatch(msg: Message) {
    const { channel } = msg;
    const handlers = map.get(channel);
    if (handlers) {
        const nop = Promise.resolve(msg);
        for (const [, handler] of handlers) {
            nop.then(handler);
        }
    }
}

async function setup() {
    if (typeof process === "object" && process.versions && process.versions.node) {
        if (process.send) {
            enable = () => process.on("message", dispatch);
            disable = () => process.off("message", dispatch);

            const send = process.send.bind(process);
            return push(send);
        }

        const { isMainThread, parentPort } = await import("worker_threads");
        if (!isMainThread && parentPort) {
            enable = () => parentPort.on("message", dispatch);
            disable = () => parentPort.off("message", dispatch);
            parentPort.start();

            const send = parentPort.postMessage.bind(parentPort);
            return push(send);
        }
    }

    if (typeof window === "object" || typeof self === "object") {
        let receiveChannel: BroadcastChannel | undefined;
        enable = () => {
            if (receiveChannel === undefined) {
                receiveChannel = new BroadcastChannel("webdock-reply");
                receiveChannel.addEventListener("message", x => dispatch(x.data));
            }
        };

        disable = () => {
            receiveChannel?.close();
            receiveChannel = undefined;
        ;}

        const sendChannel = new BroadcastChannel("webdock-request");
        const send = sendChannel.postMessage.bind(sendChannel);
        return push(send);
    }

    const send = () => {};
    return push(send);
}

setup();

namespace client {
    export const on: Dispatch = (channel, handler: (args: any) => any) => {
        let list = map.get(channel);
        if (list === undefined) {
            list = [];
        }

        const entry = [handler];
        entry.push(x => entry[0] === handler && handler(x));

        list.push(entry as any);
        map.set(channel, list);

        enable();
    };

    export const off: Dispatch = (channel, handler) => {
        let list = map.get(channel);
        if (list !== undefined) {
            let index = list.findIndex(x => x[0] === handler);
            if (index >= 0) {
                const entry = list[index];
                entry[0] = undefined;

                list.splice(index, 1);

                if (list.length < 1) {
                    map.delete(channel);
                }

                if (map.size < 1) {
                    disable();
                }        
            }
        }
    };

    export function request(msg: Message) {
        send(msg);
    }
}

export default client;
