import fs from "node:fs";
import path from "node:path";
import {Program, ProgramInfo} from "dostron/types";

export function discoverPrograms(dir: string): Program[] {
    return fs.readdirSync(dir, {withFileTypes: true})
        .filter(dirent => dirent.isDirectory())
        .map(dirent => loadProgram(path.join(dir, dirent.name)));
}

function loadProgram(dir: string): Program {
    return <Program>{
        id: path.basename(dir),
        dir,
        info: loadProgramInfo(dir)
    };
}

function loadProgramInfo(dir: string): ProgramInfo {
    const filePath = path.resolve(getDataDirectoryPath(dir), "info.json");
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, {encoding: "utf-8"})) : <ProgramInfo>{name: path.basename(dir)};
}

function getDataDirectoryPath(base: string): string {
    return path.resolve(base, ".dostron");
}
