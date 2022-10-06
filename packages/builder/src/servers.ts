import * as ipcMain from "./core/ipcMain";
import * as webServer from "./core/webServer";

export const ipc = ipcMain as Pick<typeof ipcMain, "start">;
export const web = webServer as Pick<typeof webServer, "start" | "configure">;
