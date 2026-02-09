import { invoke } from "@tauri-apps/api/core";
import type {
    DosboxVersions,
    Program,
    ProgramInfo,
    ProgramProcess,
    ProgramRunOptions,
    ProgramSummary,
    SetupState,
} from "@/types";

export const api = {
    discoverPrograms: () => invoke<Program[]>("discover_programs"),
    addPrograms: () => invoke<Program[]>("add_programs"),
    runProgram: (options: ProgramRunOptions) => invoke<ProgramProcess>("run_program", { options }),
    stopProgram: (program: Program) => invoke<void>("stop_program", { program }),
    stopAllPrograms: () => invoke<number>("stop_all_programs"),
    listProgramProcesses: () => invoke<ProgramProcess[]>("list_program_processes"),
    openProgramFolder: (program: Program) => invoke<void>("open_program_folder", { program }),
    deleteProgram: (program: Program) => invoke<void>("delete_program", { program }),
    archiveProgram: (program: Program) => invoke<void>("archive_program", { program }),
    updateProgramInfo: (program: Program, info: ProgramInfo) =>
        invoke<Program>("update_program_info", { program, info }),
    getProgramProcess: (program: Program) => invoke<ProgramProcess | null>("get_program_process", { program }),
    getProgramSummary: (program: Program) => invoke<ProgramSummary | null>("get_program_summary", { program }),
    getProgramSummaries: () => invoke<Record<string, ProgramSummary>>("get_program_summaries"),
    getDosboxVersions: () => invoke<DosboxVersions>("get_dosbox_versions"),
    addDosboxVersion: (name: string, path: string) => invoke<void>("add_dosbox_version", { name, path }),
    removeDosboxVersion: (name: string) => invoke<void>("remove_dosbox_version", { name }),
    setDefaultDosboxVersion: (name: string) => invoke<void>("set_default_dosbox_version", { name }),
    getSetupState: () => invoke<SetupState>("get_setup_state"),
    completeSetup: (library: string, dosbox: string) => invoke<void>("complete_setup", { library, dosbox }),
    setLibraryDirectory: (library: string) => invoke<void>("set_library_directory", { library }),
    pickLibraryDirectory: () => invoke<string | null>("pick_library_directory"),
    pickDosboxExecutable: () => invoke<string | null>("pick_dosbox_executable"),
};
