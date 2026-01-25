export interface Program {
    id: string;
    dir: string;
    info: ProgramInfo;
    cover?: string;
}

export interface ProgramInfo {
    name: string;
    language?: string;
    release?: number;
    category?: string;
    developer?: string;
    publisher?: string;
    series?: string;
    tags?: string[];
}

export interface ProgramProcess {
    pid: number;
    program: Program;
}

export interface ProgramSummary {
    lastRun: string;
    runs: number;
    elapsed: number;
}

export interface ProgramRunOptions {
    program: Program;
    dosboxVersion: string;
}

export type DosboxVersionConfig = Record<string, string>;

export interface SetupState {
    configured: boolean;
    library: string;
    dosbox: string;
}
