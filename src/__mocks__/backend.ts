import type { Cart, CartProcess, DosboxProbe, ExportPreview, ImportReport, LaunchInfo, SetupState } from "@/types";

/**
 * A fake `invoke` for component tests.
 *
 * Every command the UI can reach has a default answer, so a test that does not
 * care about a particular call does not have to stub it. Passing an override
 * replaces that one command; unknown commands throw, which turns a forgotten
 * stub into a visible failure instead of a silent `undefined`.
 */
export interface BackendOptions {
    carts?: Cart[];
    processes?: CartProcess[];
    launch?: LaunchInfo;
    preview?: ExportPreview;
    importReport?: ImportReport;
    /** Paths `take_pending_imports` should hand back (shell imports). */
    pendingImports?: string[];
    setup?: SetupState;
    probe?: DosboxProbe;
    exportPath?: string | null;
    /** Extra or replacement handlers, keyed by command name. */
    handlers?: Record<string, (args: Record<string, unknown>) => unknown>;
}

export const doom: Cart = {
    id: "0192f0a1-7c00-7000-8000-000000000001",
    revision: 3,
    info: {
        name: "Doom",
        release: 1993,
        category: "game",
        language: "en",
        developer: "id Software",
        publisher: "GT Interactive",
        series: "Doom",
        tags: ["FPS", "Moddable"],
        players: 4,
        platform: "DOS",
        dos: { version: "MS-DOS 5.0" },
    },
    author: { name: "Garrett", email: "garrett@example.com" },
    createdAt: "2026-01-01T00:00:00+00:00",
    dirty: true,
    summary: { lastRun: "2026-01-02T00:00:00+00:00", runs: 3, elapsed: 5400 },
};

export const wolfenstein: Cart = {
    id: "0192f0a1-7c00-7000-8000-000000000002",
    revision: 1,
    info: { name: "Wolfenstein 3D", release: 1992, category: "game" },
    createdAt: "2026-01-01T00:00:00+00:00",
};

export const civilization: Cart = {
    id: "0192f0a1-7c00-7000-8000-000000000003",
    revision: 2,
    info: { name: "Civilization", release: 1991, category: "game" },
    createdAt: "2026-01-01T00:00:00+00:00",
};

export const twoTargets: LaunchInfo = {
    targets: [
        { id: "play", label: "Main game", executable: "DOOM.EXE" },
        { id: "setup", label: "Sound setup", executable: "SETUP.EXE" },
    ],
    defaultTarget: "play",
};

export const oneTarget: LaunchInfo = {
    targets: [{ id: "play", label: "Main game", executable: "DOOM.EXE" }],
    defaultTarget: "play",
};

export function processFor(cart: Cart, targetId = "play", targetLabel = "Main game"): CartProcess {
    return {
        pid: 4242,
        cartId: cart.id,
        targetId,
        targetLabel,
        startedAt: new Date().toISOString(),
    };
}

export function makeBackend(options: BackendOptions = {}) {
    const carts = options.carts ?? [doom, wolfenstein, civilization];
    const probe = options.probe ?? { path: "/usr/bin/dosbox", exists: true, version: "DOSBox 0.74-3" };

    const defaults: Record<string, (args: Record<string, unknown>) => unknown> = {
        get_setup_state: () => options.setup ?? { configured: true, library: "/games", dosbox: "/usr/bin/dosbox" },
        discover_carts: () => carts,
        list_cart_processes: () => options.processes ?? [],
        get_cart_process: () => null,
        get_dosbox_path: () => probe,
        get_cart_launch: () => options.launch ?? twoTargets,
        run_cart: (args) => {
            const cart = carts.find((item) => item.id === args.id) ?? doom;
            const target = (options.launch ?? twoTargets).targets.find((item) => item.id === args.targetId);
            return processFor(cart, target?.id ?? "play", target?.label ?? "Main game");
        },
        stop_cart: () => undefined,
        stop_all_carts: () => 1,
        open_cart_folder: () => undefined,
        update_cart_info: (args) => {
            const cart = carts.find((item) => item.id === args.id) ?? doom;
            return { ...cart, info: args.info, author: args.author };
        },
        delete_cart: () => undefined,
        reset_cart: () => undefined,
        repair_cart: () => undefined,
        preview_export: () =>
            options.preview ?? {
                dirty: true,
                revision: 3,
                nextRevision: 4,
                packageHash: "a".repeat(64),
                currentHash: "b".repeat(64),
            },
        commit_cart: (args) => {
            const cart = carts.find((item) => item.id === args.id) ?? doom;
            return {
                ...cart,
                revision: typeof args.revision === "number" ? args.revision : cart.revision,
                dirty: false,
            };
        },
        export_cart_file: () => (options.exportPath === undefined ? "/tmp/Doom.cart" : options.exportPath),
        add_carts: () => options.importReport ?? { imported: [], skipped: [], pending: [] },
        import_carts: () => options.importReport ?? { imported: [], skipped: [], pending: [] },
        take_pending_imports: () => options.pendingImports ?? [],
        resolve_import: () => doom,
        probe_dosbox_path: () => probe,
        set_dosbox_path: (args) => ({ ...probe, path: args.path }),
        complete_setup: () => undefined,
        set_library_directory: () => undefined,
        pick_library_directory: () => null,
        pick_dosbox_executable: () => null,
    };

    const handlers = { ...defaults, ...options.handlers };

    return async (command: string, args: Record<string, unknown> = {}) => {
        const handler = handlers[command];
        if (!handler) {
            throw new Error(`unexpected command in test: ${command}`);
        }
        return handler(args);
    };
}
