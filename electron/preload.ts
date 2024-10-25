import {contextBridge, ipcRenderer} from "electron";
import {Program, ProgramProcess, ProgramSummary} from "dostron/types";

contextBridge.exposeInMainWorld("$api", {
    discoverPrograms: async (): Promise<Program> => ipcRenderer.invoke("discoverPrograms"),
    runProgram: async (program: Program): Promise<ProgramProcess> => ipcRenderer.invoke("runProgram", program),
    stopProgram: async (program: Program): Promise<void> => ipcRenderer.invoke("stopProgram", program),
    openProgramFolder: async (program: Program): Promise<void> => ipcRenderer.invoke("openProgramFolder", program),
    deleteProgram: async (program: Program): Promise<void> => ipcRenderer.invoke("deleteProgram", program),
    archiveProgram: async (program: Program): Promise<void> => ipcRenderer.invoke("archiveProgram", program),
    addPrograms: async (): Promise<Program[]> => ipcRenderer.invoke("addPrograms"),
    getProgramProcess: async (program: Program): Promise<ProgramProcess> => ipcRenderer.invoke("getProgramProcess", program),
    getProgramSummary: (program: Program): Promise<ProgramSummary | undefined> => ipcRenderer.invoke("getProgramSummary", program)
});
