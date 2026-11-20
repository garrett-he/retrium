import { invoke } from "@tauri-apps/api/core";
import type { Cart, CartInfo, CartProcess, CartRunOptions, CartSummary, DosboxVersions, SetupState } from "@/types";

export const api = {
    discoverCarts: () => invoke<Cart[]>("discover_carts"),
    addCarts: () => invoke<Cart[]>("add_carts"),
    runCart: (options: CartRunOptions) => invoke<CartProcess>("run_cart", { options }),
    stopCart: (cart: Cart) => invoke<void>("stop_cart", { cart }),
    stopAllCarts: () => invoke<number>("stop_all_carts"),
    listCartProcesses: () => invoke<CartProcess[]>("list_cart_processes"),
    openCartFolder: (cart: Cart) => invoke<void>("open_cart_folder", { cart }),
    deleteCart: (cart: Cart) => invoke<void>("delete_cart", { cart }),
    archiveCart: (cart: Cart) => invoke<void>("archive_cart", { cart }),
    updateCartInfo: (cart: Cart, info: CartInfo) => invoke<Cart>("update_cart_info", { cart, info }),
    getCartProcess: (cart: Cart) => invoke<CartProcess | null>("get_cart_process", { cart }),
    getCartSummary: (cart: Cart) => invoke<CartSummary | null>("get_cart_summary", { cart }),
    getCartSummaries: () => invoke<Record<string, CartSummary>>("get_cart_summaries"),
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
