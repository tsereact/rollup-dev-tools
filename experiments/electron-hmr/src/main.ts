import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "url";

function load() {
    const win = new BrowserWindow({

        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
        }
    })

    const path = fileURLToPath(new URL("./index.html", import.meta.url));
    win.loadFile(path);
    win.maximize();
}

app.whenReady().then(load);
