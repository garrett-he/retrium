declare module "dostron/types" {
    interface Program {
        id: string;
        dir: string;
        info: ProgramInfo;
        cover?: string | undefined;
    }

    interface ProgramInfo {
        name: string;
        language?: string;
        release?: number;
        category?: string;
        developer?: string;
        publisher?: string;
        series?: string;
        tags?: string[];
    }

    interface ProgramProcess {
        pid: number;
        program: Program;
    }

    interface ProgramSummary {
        lastRun: Date;
        runs: number;
        elapsed: number;
    }

    type DosboxVersionConfig = { [key: string]: string };

    interface ProgramRunOptions {
        program: Program;
        dosboxVersion: string;
    }
}
