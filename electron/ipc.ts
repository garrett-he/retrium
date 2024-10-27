import fs from "fs-extra";
import path from "node:path";
import {ipcMain, shell, dialog, SaveDialogOptions, OpenDialogOptions} from "electron";
import watch from "node-watch";
import {Program, ProgramProcess, ProgramSummary, DosboxVersionConfig, ProgramRunOptions} from "dostron/types";
import {discoverPrograms, ProcessManager, archiveProgram, extractProgramArchive, getProgramSummary, setProgramSummary, restoreProgramStates} from "./dostron";
import config from "./config";

const programsDir = path.join(config.get("library"), "programs");
const summariesDir = path.join(config.get("library"), "summaries");
const statesDir = path.join(config.get("library"), "states");
const processManager = new ProcessManager();

ipcMain.handle("discoverPrograms", async (): Promise<Program[]> => discoverPrograms(programsDir));

ipcMain.handle("runProgram", async (_, options: ProgramRunOptions): Promise<ProgramProcess> => {
    const program = options.program;
    let process = processManager.findProcessByProgram(program);
    if (process) {
        throw new Error(`Program is already running with PID: ${process.pid}`);
    }

    restoreProgramStates(path.join(statesDir, program.id), program);

    const dosbox = config.get("dosbox").versions[options.dosboxVersion ?? config.get("dosbox").default];
    process = processManager.runProgram(program, dosbox);

    const summary = getProgramSummary(summariesDir, program) || <ProgramSummary>{
        runs: 0,
        elapsed: 0
    };

    summary.lastRun = new Date();

    const watcher = watch(program.dir, {recursive: true});
    watcher.on("change", (event, filePath: string) => {
        const relativePath = filePath.replace(program.dir, "");
        const target = path.join(statesDir, program.id, relativePath);

        fs.ensureDirSync(path.dirname(target));

        // Make sure the file is not temporary and won't disappear
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.copyFileSync(filePath, target);
        }
    });

    process.on("exit", () => {
        summary.runs++;
        summary.elapsed += Math.round(((new Date()).getTime() - summary.lastRun.getTime()) / 1000);
        summary.lastRun = new Date();

        setProgramSummary(summariesDir, program, summary);
    });

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

ipcMain.handle("getProgramProcess", async (event, program: Program): Promise<ProgramProcess | undefined> => {
    return processManager.findProcessByProgram(program);
});

ipcMain.handle("getProgramSummary", async (_, program: Program): Promise<ProgramSummary | undefined> => getProgramSummary(summariesDir, program));

ipcMain.handle("getDosboxVersions", async (): Promise<DosboxVersionConfig> => {
    return config.get("dosbox")["versions"];
});
