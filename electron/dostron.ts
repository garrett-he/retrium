import fs from "node:fs";
import path from "node:path";
import {Program} from "dostron/types";

export function discoverPrograms(dir: string): Program[] {
    return fs.readdirSync(dir, {withFileTypes: true})
        .filter(dirent => dirent.isDirectory())
        .map(dirent => loadProgram(path.join(dir, dirent.name)));
}

function loadProgram(dir: string): Program {
    return <Program>{
        id: path.basename(dir),
        dir
    };
}
