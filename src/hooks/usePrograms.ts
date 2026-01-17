import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DosboxVersionConfig, Program } from "@/types";

export function usePrograms() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [dosboxVersions, setDosboxVersions] = useState<DosboxVersionConfig>({});
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setPrograms(await api.discoverPrograms());
    }, []);

    const loadVersions = useCallback(async () => {
        setDosboxVersions(await api.getDosboxVersions());
    }, []);

    useEffect(() => {
        Promise.all([refresh(), loadVersions()]).finally(() => setLoading(false));
    }, [refresh, loadVersions]);

    return { programs, dosboxVersions, loading, refresh };
}

type ProgramsContextValue = ReturnType<typeof usePrograms>;

const ProgramsContext = createContext<ProgramsContextValue | null>(null);

export function ProgramsProvider({ children }: { children: ReactNode }) {
    const value = usePrograms();
    return createElement(ProgramsContext.Provider, { value }, children);
}

export function useProgramsContext(): ProgramsContextValue {
    const ctx = useContext(ProgramsContext);
    if (!ctx) {
        throw new Error("useProgramsContext must be used within a ProgramsProvider");
    }
    return ctx;
}
