import fs from "node:fs";
import {ipcMain, shell} from "electron";
import {Program, ProgramProcess} from "dostron/types";
import {discoverPrograms, ProcessManager} from "./dostron";
import config from "./config";

const processManager = new ProcessManager();

ipcMain.handle("discoverPrograms", async (): Promise<Program[]> => discoverPrograms(config.get("library")));

ipcMain.handle("runProgram", async (_, program: Program): Promise<ProgramProcess> => {
    let process = processManager.findProcessByProgram(program);
    if (process) {
        throw new Error(`Program is already running with PID: ${process.pid}`);
    }

    process = processManager.runProgram(program, config.get("dosbox"));

    return <ProgramProcess>{
        pid: process.pid,
        program
    };
});

ipcMain.handle("stopProgram", async (event, program: Program): Promise<void> => {
    await processManager.killProcessByProgram(program);
});

ipcMain.handle("openProgramFolder", async (event, program: Program): Promise<void> => {
    await shell.openPath(program.dir);
});

ipcMain.handle("deleteProgram", async (event, program: Program): Promise<void> => {
    fs.rmSync(program.dir, {recursive: true});
});
