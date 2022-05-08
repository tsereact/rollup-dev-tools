import type { Dispatch, Message } from "./Message";
import { EventEmitter } from "events";

const channels = new WeakMap<EventEmitter, Set<string>>();
const emitter = new EventEmitter();
const ports = new Set<EventEmitter>();

namespace server {
    export const on: Dispatch<[port: EventEmitter]> = (channel, handler) => {
        emitter.on(channel, handler);
    };

    export function dispatch(msg: Message) {
        emitter.emit(msg.channel, msg);
    }

    export function replyAll(msg: Message) {
        for (const port of ports) {
            replyOne(msg, port);
        }
    }

    export function replyOne(msg: Message, port: EventEmitter) {
        const filter = channels.get(port);
        filter?.has(msg.channel) && port.emit("send", msg);
    }

    export function add(port: EventEmitter) {
        ports.add(port);
    }

    export function remove(port: EventEmitter) {
        ports.delete(port);
    }

    export function observe(port: EventEmitter, channel: string) {
        let filter = channels.get(port);
        if (filter === undefined) {
            channels.set(port, filter = new Set<string>());
        }

        filter.add(channel);
    }
}

export default server;
