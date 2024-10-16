import {contextBridge, ipcRenderer} from "electron";
import {Program} from "dostron/types";

contextBridge.exposeInMainWorld("$api", {
    discoverPrograms: async (): Promise<Program> => ipcRenderer.invoke("discoverPrograms")
});
