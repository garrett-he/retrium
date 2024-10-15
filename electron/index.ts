import path from "node:path";
import {app, BrowserWindow, protocol} from "electron";

function registerLocalResourceProtocol() {
    protocol.registerFileProtocol("local-resource", (request, callback) => {
        const url = request.url.replace(/^local-resource:\/\//, "");
        const decodedUrl = decodeURI(url);

        try {
            return callback(decodedUrl)
        } catch (error) {
            console.error("ERROR: registerLocalResourceProtocol: Could not get file path:", error);
        }
    });
}

async function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: (process.env.ELECTRON_NODE_INTEGRATION as unknown) as boolean,
            preload: path.resolve(__dirname, "preload.js")
        }
    });

    if (app.isPackaged) {
        await win.loadFile(path.join(__dirname, "../dist/index.html"));
    } else {
        const url = process.env["VITE_DEV_SERVER_URL"];

        if (!url) {
            throw new Error("Missing environment variable: VITE_DEV_SERVER_URL.");
        }

        await win.loadURL(url);
        win.webContents.openDevTools();
    }
}

app.whenReady().then(async () => {
    registerLocalResourceProtocol();
    await createWindow();
});
