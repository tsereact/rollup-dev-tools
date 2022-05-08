
export namespace HMR {
    export interface Announce {
        channel: "hmr-announce";
        id: string;
    }

    export interface Discover {
        channel: "hmr-discover";
    }

    export interface Notify {
        channel: `hmr-notify-${string}`;
        chunk: string;
        gen: number;
    }

    export interface Publish {
        channel: "hmr-publish";
        id: string;
        chunk: string;
        gen: number;
    }
}

export namespace Screen {
    export interface Advertise {
        channel: "screen-advertise";
        names: string[];
    }

    export interface Subscribe {
        channel: "screen-subscribe";
        name: string;
    }

    export interface Update {
        channel: `screen-update-${string}`;
        reset: boolean;
        lines: string[];
    }
}

export namespace System {
    export interface Advertise {
        channel: "system-advertise";
        tasks: Record<string, "restart" | "running" | `error: ${string}` | `exit: ${number}` | false>;
    }

    export interface Control {
        channel: "system-control";
        request: "kill" | "start" | "stop";
    }

    export interface Inspect {
        channel: "system-inspect";
        id: string;
        port: number;
    }

    export interface Subscribe {
        channel: "system-subscribe";
    }

    export interface Task {
        channel: "system-task";
        id: string;
        screen: string;
        group?: string;

        kind: "fork" | "shell" | "worker";
        cmd?: string;
        url?: string;

        cwd?: string;
        env?: Record<string, string>;
        data?: Record<string, unknown>;
        procArgs?: string[];
        execArgs?: string[];
    }
}

export namespace Web {
    export interface Advertise {
        channel: "web-advertise";
        ports: number[];
    }
    
    export interface Path {
        channel: "web-path";
        port: number;
        host: string;
        name: string;
    }

    export interface Port {
        channel: "web-port";
        port: number;
        host: string;
        name: string;
    }
}

export interface MessageNS {
    hmr_announce: HMR.Announce;
    hmr_discover: HMR.Discover;
    hmr_notify: HMR.Notify;
    hmr_publish: HMR.Publish;
    screen_advertise: Screen.Advertise;
    screen_subscribe: Screen.Subscribe;
    screen_update: Screen.Update;
    web_advertise: Web.Advertise;
    web_path: Web.Path;
    web_port: Web.Port;
}

export interface Handler<T, V extends any[] = any[]> {
    (msg: T, ...args: V): any
}

interface Generic {
    channel: string;
}

type Expand<T extends Generic, V extends any[]> = [channel: T["channel"], handler: Handler<T, V>];

export interface Dispatch<T extends any[] = any[]> {
    (...args: Expand<HMR.Announce, T>): void;
    (...args: Expand<HMR.Discover, T>): void;
    (...args: Expand<HMR.Notify, T>): void;
    (...args: Expand<HMR.Publish, T>): void;
    (...args: Expand<Screen.Advertise, T>): void;
    (...args: Expand<Screen.Subscribe, T>): void;
    (...args: Expand<Screen.Update, T>): void;
    (...args: Expand<Web.Advertise, T>): void;
    (...args: Expand<Web.Path, T>): void;
    (...args: Expand<Web.Port, T>): void;
}

export const Message = undefined;
export type Message = MessageNS[keyof MessageNS];

export default Message;
