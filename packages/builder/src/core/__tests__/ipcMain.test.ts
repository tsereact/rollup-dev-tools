import { WebSocket } from "ws";
import { lockEnter, start, shutdown, lockLeave, waitForProjects, captureScreen, emitScreen, captureScreenOff, captureScreenFlush } from "../ipcMain";
import IpcSocket from "../IpcSocket";
import IpcStateHub from "../IpcStateHub";

beforeAll(async () => {
    process.env.ROLLUP_IPC_PORT = "";
    process.env.ROLLUP_WATCH = "true";
    await start();
});

afterAll(async () => {
    await shutdown();
});

describe("ipcMain", () => {
    test("captureScreen", async () => {
        captureScreen();
        console.log("some text");
        captureScreenFlush();
        captureScreenOff();

        const text = await emitScreen();
        expect(text).toMatch(/some text/);
    });

    test("ipcEnter - ipcLeave", async () => {
        const token = await lockEnter();
        const promise = lockEnter();
        lockLeave(token);
        lockLeave(await promise);
    });

    test("socket - direct", async () => {
        const port = await start();
        const socket = await IpcSocket.connect(port);
        const hub = new IpcStateHub();
        hub.set({}, { project: "foobar-1" });
        hub.sync(socket);

        await waitForProjects("foobar-1")
        socket.close();        
    });

    test("socket - websocket", async () => {
        const port = await start();
        const ws = new WebSocket(port);
        const socket = await IpcSocket.acceptWebSocket(ws);
        const hub = new IpcStateHub();
        hub.set({}, { project: "foobar-2" });
        hub.sync(socket);

        await waitForProjects("foobar-2")
        socket.close();
    });
});
