import fs from "node:fs";
import path from "node:path";
import {ipcMain, shell, dialog, SaveDialogOptions} from "electron";
import {Program, ProgramProcess} from "dostron/types";
import {discoverPrograms, ProcessManager, archiveProgram, extractProgramArchive} from "./dostron";
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

ipcMain.handle("archiveProgram", async (event, program: Program): Promise<void> => {
    const filePath = dialog.showSaveDialogSync(<SaveDialogOptions>{
        defaultPath: `${path.basename(program.dir)}.zip`,
        filters: [
            {name: "Program Packages", extensions: ["zip", "tar.gz", "tgz"]},
            {name: "All Files", extensions: ["*"]}
        ],
        properties: ["createDirectory"]
    });

    if (filePath) {
        return archiveProgram(program, filePath);
    }
});


ipcMain.handle("addPrograms", async (): Promise<Program[]> => {
    const filePaths = dialog.showOpenDialogSync(<OpenDialogOptions>{
        filters: [
            {name: "Program Archive", extensions: ["zip", "tar.gz", "tgz"]},
            {name: "All Files", extensions: ["*"]}
        ],
        properties: ["openFile", "multiSelections"]
    });

    if (!filePaths) {
        return [];
    }

    return Promise.all(filePaths.map(async filePath => {
        return await extractProgramArchive(filePath, path.resolve(config.get("library"), path.parse(filePath).name));
    }));
});
