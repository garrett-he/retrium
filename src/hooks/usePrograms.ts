import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DosboxVersionConfig, Program, SetupState } from "@/types";

export function usePrograms() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [dosboxVersions, setDosboxVersions] = useState<DosboxVersionConfig>({});
    const [setupState, setSetupState] = useState<SetupState | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setPrograms(await api.discoverPrograms());
    }, []);

    const loadVersions = useCallback(async () => {
        setDosboxVersions(await api.getDosboxVersions());
    }, []);

    const completeSetup = useCallback(
        async (library: string, dosbox: string) => {
            await api.completeSetup(library, dosbox);
            setSetupState({ configured: true, library, dosbox });
            await Promise.all([refresh(), loadVersions()]);
        },
        [refresh, loadVersions],
    );

    useEffect(() => {
        Promise.all([refresh(), loadVersions(), api.getSetupState().then(setSetupState)]).finally(() =>
            setLoading(false),
        );
    }, [refresh, loadVersions]);

    return { programs, dosboxVersions, setupState, loading, refresh, completeSetup };
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
