import { invoke } from "@tauri-apps/api/core";
import type { DosboxVersionConfig, Program, ProgramProcess, ProgramRunOptions, ProgramSummary } from "@/types";

export const api = {
    discoverPrograms: () => invoke<Program[]>("discover_programs"),
    runProgram: (options: ProgramRunOptions) => invoke<ProgramProcess>("run_program", { options }),
    stopProgram: (program: Program) => invoke<void>("stop_program", { program }),
    openProgramFolder: (program: Program) => invoke<void>("open_program_folder", { program }),
    deleteProgram: (program: Program) => invoke<void>("delete_program", { program }),
    archiveProgram: (program: Program) => invoke<void>("archive_program", { program }),
    addPrograms: () => invoke<Program[]>("add_programs"),
    getProgramProcess: (program: Program) => invoke<ProgramProcess | null>("get_program_process", { program }),
    getProgramSummary: (program: Program) => invoke<ProgramSummary | null>("get_program_summary", { program }),
    getDosboxVersions: () => invoke<DosboxVersionConfig>("get_dosbox_versions"),
};
