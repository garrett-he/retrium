import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Cart, CartInfo, CartProcess, CartSummary, DosboxVersions, SetupState } from "@/types";

export function useCarts() {
    const [carts, setCarts] = useState<Cart[]>([]);
    const [dosboxVersions, setDosboxVersions] = useState<DosboxVersions>({ default: "", versions: [] });
    const [processes, setProcesses] = useState<CartProcess[]>([]);
    const [summaries, setSummaries] = useState<Record<string, CartSummary>>({});
    const [setupState, setSetupState] = useState<SetupState | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const [list, summaryMap] = await Promise.all([api.discoverCarts(), api.getCartSummaries()]);
        setCarts(list);
        setSummaries(summaryMap);
    }, []);

    const refreshVersions = useCallback(async () => {
        setDosboxVersions(await api.getDosboxVersions());
    }, []);

    const refreshProcesses = useCallback(async () => {
        setProcesses(await api.listCartProcesses());
    }, []);

    useEffect(() => {
        Promise.all([refresh(), refreshVersions(), refreshProcesses(), api.getSetupState().then(setSetupState)])
            .catch((error) => console.error("retrium: failed to load initial state", error))
            .finally(() => setLoading(false));
    }, [refresh, refreshVersions, refreshProcesses]);

    useEffect(() => {
        const timer = setInterval(() => {
            refreshProcesses().catch((error) => console.error("retrium: process poll failed", error));
        }, 2000);
        return () => clearInterval(timer);
    }, [refreshProcesses]);

    const defaultVersionName = useCallback(() => {
        const found = dosboxVersions.versions.find((v) => v.name === dosboxVersions.default);
        return found?.name ?? dosboxVersions.versions[0]?.name;
    }, [dosboxVersions]);

    const completeSetup = useCallback(
        async (library: string, dosbox: string) => {
            await api.completeSetup(library, dosbox);
            setSetupState({ configured: true, library, dosbox });
            await Promise.all([refresh(), refreshVersions()]);
        },
        [refresh, refreshVersions],
    );

    const changeLibraryDirectory = useCallback(
        async (library: string) => {
            await api.setLibraryDirectory(library);
            setSetupState((state) => (state ? { ...state, library } : state));
            await refresh();
        },
        [refresh],
    );

    const runCart = useCallback(
        async (cart: Cart, version?: string) => {
            const name = version ?? defaultVersionName();
            if (!name) {
                throw new Error("No DOSBox version configured");
            }
            await api.runCart({ cart, dosboxVersion: name });
            await refreshProcesses();
        },
        [defaultVersionName, refreshProcesses],
    );

    const stopCart = useCallback(
        async (cart: Cart) => {
            await api.stopCart(cart);
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
        const added = await api.addCarts();
        await refresh();
        return added;
    }, [refresh]);

    const saveCartInfo = useCallback(async (cart: Cart, info: CartInfo) => {
        const updated = await api.updateCartInfo(cart, info);
        setCarts((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        return updated;
    }, []);

    const deleteCart = useCallback(
        async (cart: Cart) => {
            await api.deleteCart(cart);
            await refresh();
        },
        [refresh],
    );

    const addDosboxVersion = useCallback(
        async (name: string, path: string) => {
            await api.addDosboxVersion(name, path);
            await refreshVersions();
        },
        [refreshVersions],
    );

    const removeDosboxVersion = useCallback(
        async (name: string) => {
            await api.removeDosboxVersion(name);
            await refreshVersions();
        },
        [refreshVersions],
    );

    const setDefaultDosboxVersion = useCallback(
        async (name: string) => {
            await api.setDefaultDosboxVersion(name);
            await refreshVersions();
        },
        [refreshVersions],
    );

    return {
        carts,
        dosboxVersions,
        processes,
        summaries,
        setupState,
        loading,
        refresh,
        completeSetup,
        changeLibraryDirectory,
        runCart,
        stopCart,
        stopAllCarts,
        addCarts,
        saveCartInfo,
        deleteCart,
        addDosboxVersion,
        removeDosboxVersion,
        setDefaultDosboxVersion,
    };
}

type CartsContextValue = ReturnType<typeof useCarts>;

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
