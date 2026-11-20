import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
    Author,
    Cart,
    CartInfo,
    CartProcess,
    DosboxProbe,
    ExportPreview,
    ImportAction,
    LaunchInfo,
    SetupState,
} from "@/types";

/**
 * One source of truth for the library: the cart list, the live processes and
 * the cached `launch.json` of every cart whose Run menu has been opened.
 *
 * Carts carry their own summary, so there is no separate summaries map — the
 * backend joins the two tables on every `discover_carts`.
 */
export function useCarts() {
    const [carts, setCarts] = useState<Cart[]>([]);
    const [processes, setProcesses] = useState<CartProcess[]>([]);
    const [launch, setLaunch] = useState<Record<string, LaunchInfo>>({});
    const [dosbox, setDosbox] = useState<DosboxProbe | null>(null);
    const [setupState, setSetupState] = useState<SetupState | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setCarts(await api.discoverCarts());
    }, []);

    const refreshProcesses = useCallback(async () => {
        setProcesses(await api.listCartProcesses());
    }, []);

    const refreshDosbox = useCallback(async () => {
        setDosbox(await api.getDosboxPath());
    }, []);

    useEffect(() => {
        Promise.all([refresh(), refreshProcesses(), refreshDosbox(), api.getSetupState().then(setSetupState)])
            .catch((error) => console.error("retrium: failed to load initial state", error))
            .finally(() => setLoading(false));
    }, [refresh, refreshProcesses, refreshDosbox]);

    useEffect(() => {
        const timer = setInterval(() => {
            refreshProcesses().catch((error) => console.error("retrium: process poll failed", error));
        }, 2000);
        return () => clearInterval(timer);
    }, [refreshProcesses]);

    /** `launch.json` is read on demand: a library of 200 carts should not read 200 files at startup. */
    const loadLaunch = useCallback(async (id: string) => {
        const info = await api.getCartLaunch(id);
        setLaunch((map) => ({ ...map, [id]: info }));
        return info;
    }, []);

    const forgetLaunch = useCallback((id: string) => {
        setLaunch((map) => {
            const { [id]: _dropped, ...rest } = map;
            return rest;
        });
    }, []);

    const completeSetup = useCallback(
        async (library: string, dosboxPath: string) => {
            await api.completeSetup(library, dosboxPath);
            setSetupState({ configured: true, library, dosbox: dosboxPath });
            await Promise.all([refresh(), refreshDosbox()]);
        },
        [refresh, refreshDosbox],
    );

    const changeLibraryDirectory = useCallback(
        async (library: string) => {
            await api.setLibraryDirectory(library);
            setSetupState((state) => (state ? { ...state, library } : state));
            setLaunch({});
            await refresh();
        },
        [refresh],
    );

    const saveDosboxPath = useCallback(async (path: string) => {
        const probe = await api.setDosboxPath(path);
        setDosbox(probe);
        setSetupState((state) => (state ? { ...state, dosbox: probe.path } : state));
        return probe;
    }, []);

    const runCart = useCallback(
        async (id: string, targetId?: string) => {
            const process = await api.runCart(id, targetId);
            await refreshProcesses();
            return process;
        },
        [refreshProcesses],
    );

    const stopCart = useCallback(
        async (id: string) => {
            await api.stopCart(id);
            await refreshProcesses();
        },
        [refreshProcesses],
    );

    const stopAllCarts = useCallback(async () => {
        const stopped = await api.stopAllCarts();
        await refreshProcesses();
        return stopped;
    }, [refreshProcesses]);

    const addCarts = useCallback(async () => {
        const report = await api.addCarts();
        await refresh();
        return report;
    }, [refresh]);

    const resolveImport = useCallback(
        async (archive: string, action: ImportAction) => {
            const cart = await api.resolveImport(archive, action);
            if (cart) {
                setLaunch((map) => {
                    const { [cart.id]: _stale, ...rest } = map;
                    return rest;
                });
            }
            await refresh();
            return cart;
        },
        [refresh],
    );

    const saveCartInfo = useCallback(async (id: string, info: CartInfo, author?: Author) => {
        const updated = await api.updateCartInfo(id, info, author);
        setCarts((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        return updated;
    }, []);

    const deleteCart = useCallback(
        async (id: string) => {
            await api.deleteCart(id);
            forgetLaunch(id);
            await refresh();
        },
        [refresh, forgetLaunch],
    );

    const resetCart = useCallback(
        async (id: string) => {
            await api.resetCart(id);
            forgetLaunch(id);
            await refresh();
        },
        [refresh, forgetLaunch],
    );

    const repairCart = useCallback(
        async (id: string) => {
            await api.repairCart(id);
            forgetLaunch(id);
            await refresh();
        },
        [refresh, forgetLaunch],
    );

    const previewExport = useCallback((id: string): Promise<ExportPreview> => api.previewExport(id), []);

    /**
     * Rebuild the archive at `revision` and return the refreshed cart. Only the
     * export dialog calls this: it is the single write entry point for
     * `cart.revision`.
     */
    const commitCart = useCallback(async (id: string, revision?: number) => {
        const updated = await api.commitCart(id, revision);
        setCarts((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        return updated;
    }, []);

    const exportCartFile = useCallback((id: string) => api.exportCartFile(id), []);

    return {
        carts,
        processes,
        launch,
        dosbox,
        setupState,
        loading,
        refresh,
        refreshProcesses,
        refreshDosbox,
        loadLaunch,
        completeSetup,
        changeLibraryDirectory,
        saveDosboxPath,
        runCart,
        stopCart,
        stopAllCarts,
        addCarts,
        resolveImport,
        saveCartInfo,
        deleteCart,
        resetCart,
        repairCart,
        previewExport,
        commitCart,
        exportCartFile,
    };
}

export type CartsContextValue = ReturnType<typeof useCarts>;

const CartsContext = createContext<CartsContextValue | null>(null);

export function CartsProvider({ children }: { children: ReactNode }) {
    const value = useCarts();
    return createElement(CartsContext.Provider, { value }, children);
}

export function useCartsContext(): CartsContextValue {
    const ctx = useContext(CartsContext);
    if (!ctx) {
        throw new Error("useCartsContext must be used within a CartsProvider");
    }
    return ctx;
}

/** `true` while any process is running this cart. One cart, one instance. */
export function useRunning(processes: CartProcess[], id: string | undefined): CartProcess | undefined {
    return id ? processes.find((process) => process.cartId === id) : undefined;
}
