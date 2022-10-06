import { EventEmitter } from "events";
import { IncomingMessage } from "http";
import { Readable } from "stream";
import { Socket } from "net";
import { WebSocketServer } from "ws";

import IpcSocket from "./IpcSocket";

export class IpcServer extends EventEmitter {
    wss?: WebSocketServer;

    constructor() {
        super();
        this.accept = this.accept.bind(this);
        this.handleUpgrade = this.handleUpgrade.bind(this);
    }

    accept(req: IncomingMessage, socket: Socket, head: Buffer) {
        const { upgrade } = req.headers;
        if (req.httpVersion === "1.1" && upgrade) {
            if (upgrade.toLowerCase() === "websocket") {
                let { wss } = this;
                if (wss === undefined) {
                    this.wss = wss = new WebSocketServer({
                        noServer: true,
                        perMessageDeflate: false,
                    });
                }

                wss.handleUpgrade(req, socket, head, ws => {
                    const ipc = IpcSocket.acceptWebSocket(ws, ws.protocol);
                    this.emit("accept", ipc, req.url);
                });

                return true;
            }

            const { connection } = req.headers;
            const lines = [
                `HTTP/1.1 101 Switching Protocols\r\n`,
                `Connection: ${connection}\r\n`,
                `Upgrade: ${upgrade}\r\n`,
                "\r\n"
            ];

            socket.pause();
            socket.unshift(head);
            socket.write(lines.join(""));

            const decoder = new Readable({
                encoding: "utf-8",
                read() {},
            });

            const ipc = IpcSocket.acceptNativeSocket(socket, decoder, upgrade);
            this.emit("accept", ipc, req.url);

            return true;
        }

        return false;
    }

    handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
        if (!this.accept(req, socket, head)) {
            const ver = req.httpVersion;
            const lines = [
                `HTTP/${ver} 400 Bad Request\r\n`,
                `Connection: close\r\n`,
                "\r\n"
            ];
        
            socket.write(lines.join(""));
            socket.end(() => socket.destroy());
        }
    }
}

export default IpcServer;
