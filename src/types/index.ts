export interface DosboxVersion {
    name: string;
    path: string;
}

export interface DosboxVersions {
    default: string;
    versions: DosboxVersion[];
}

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
    dosboxVersion: string;
    startedAt: string;
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

export interface SetupState {
    configured: boolean;
    library: string;
    dosbox: string;
}
