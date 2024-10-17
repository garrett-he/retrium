declare module "dostron/types" {
    interface Program {
        id: string;
        dir: string;
        info: ProgramInfo;
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
}
