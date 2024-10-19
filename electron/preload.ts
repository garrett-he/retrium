import {contextBridge, ipcRenderer} from "electron";
import {Program, ProgramProcess} from "dostron/types";

contextBridge.exposeInMainWorld("$api", {
    discoverPrograms: async (): Promise<Program> => ipcRenderer.invoke("discoverPrograms"),
    runProgram: async (program: Program): Promise<ProgramProcess> => ipcRenderer.invoke("runProgram", program),
    stopProgram: async (program: Program): Promise<void> => ipcRenderer.invoke("stopProgram", program)
});
