
export interface MessageBase {
    channel: string;
}

export namespace HMR {
    export interface Announce extends MessageBase {
        channel: "hmr-announce";
        id: string;
    }

    export interface Notify extends MessageBase {
        channel: `hmr-notify-${string}`;
        chunk: string;
        gen: number;
    }

    export interface Publish extends MessageBase {
        channel: "hmr-publish";
        id: string;
        chunk: string;
        gen: number;
    }
}

export interface MessageNS {
    hmr_announce: HMR.Announce;
    hmr_notify: HMR.Notify;
    hmr_publish: HMR.Publish;
}

export interface Handler<T, V extends any[] = any[]> {
    (msg: T, ...args: V): any
}

export interface Dispatch<T extends any[] = any[]> {
    (channel: HMR.Announce["channel"], handler: Handler<HMR.Announce, T>): void;
    (channel: HMR.Notify["channel"], handler: Handler<HMR.Notify, T>): void;
    (channel: HMR.Publish["channel"], handler: Handler<HMR.Publish, T>): void;
}

export const Message = undefined;
export type Message = MessageNS[keyof MessageNS];

export default Message;