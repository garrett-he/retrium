import { invoke } from "@tauri-apps/api/core";
import type {
    Author,
    Cart,
    CartInfo,
    CartProcess,
    DosboxProbe,
    ExportPreview,
    ImportAction,
    ImportReport,
    LaunchInfo,
    SetupState,
} from "@/types";

export const api = {
    discoverCarts: () => invoke<Cart[]>("discover_carts"),
    addCarts: () => invoke<ImportReport>("add_carts"),
    importCarts: (paths: string[]) => invoke<ImportReport>("import_carts", { paths }),
    takePendingImports: () => invoke<string[]>("take_pending_imports"),
    resolveImport: (archive: string, action: ImportAction) => invoke<Cart>("resolve_import", { archive, action }),

    getCartLaunch: (id: string) => invoke<LaunchInfo>("get_cart_launch", { id }),
    runCart: (id: string, targetId?: string) => invoke<CartProcess>("run_cart", { id, targetId }),
    stopCart: (id: string) => invoke<void>("stop_cart", { id }),
    stopAllCarts: () => invoke<number>("stop_all_carts"),
    listCartProcesses: () => invoke<CartProcess[]>("list_cart_processes"),
    getCartProcess: (id: string) => invoke<CartProcess | null>("get_cart_process", { id }),

    openCartFolder: (id: string) => invoke<void>("open_cart_folder", { id }),
    updateCartInfo: (id: string, info: CartInfo, author?: Author) =>
        invoke<Cart>("update_cart_info", { id, info, author }),
    deleteCart: (id: string) => invoke<void>("delete_cart", { id }),
    resetCart: (id: string) => invoke<void>("reset_cart", { id }),
    repairCart: (id: string) => invoke<void>("repair_cart", { id }),

    previewExport: (id: string) => invoke<ExportPreview>("preview_export", { id }),
    commitCart: (id: string, revision?: number) => invoke<Cart>("commit_cart", { id, revision }),
    exportCartFile: (id: string) => invoke<string | null>("export_cart_file", { id }),

    getDosboxPath: () => invoke<DosboxProbe>("get_dosbox_path"),
    setDosboxPath: (path: string) => invoke<DosboxProbe>("set_dosbox_path", { path }),
    setDosboxScale: (scale: number) => invoke<void>("set_dosbox_scale", { scale }),
    probeDosboxPath: (path: string) => invoke<DosboxProbe>("probe_dosbox_path", { path }),

    getSetupState: () => invoke<SetupState>("get_setup_state"),
    completeSetup: (library: string, dosbox: string) => invoke<void>("complete_setup", { library, dosbox }),
    setLibraryDirectory: (library: string) => invoke<void>("set_library_directory", { library }),
    pickLibraryDirectory: () => invoke<string | null>("pick_library_directory"),
    pickDosboxExecutable: () => invoke<string | null>("pick_dosbox_executable"),
};
