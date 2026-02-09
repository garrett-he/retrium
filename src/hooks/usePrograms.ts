import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DosboxVersions, Program, ProgramInfo, ProgramProcess, ProgramSummary, SetupState } from "@/types";

export function usePrograms() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [dosboxVersions, setDosboxVersions] = useState<DosboxVersions>({ default: "", versions: [] });
    const [processes, setProcesses] = useState<ProgramProcess[]>([]);
    const [summaries, setSummaries] = useState<Record<string, ProgramSummary>>({});
    const [setupState, setSetupState] = useState<SetupState | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const [list, summaryMap] = await Promise.all([api.discoverPrograms(), api.getProgramSummaries()]);
        setPrograms(list);
        setSummaries(summaryMap);
    }, []);

    const refreshVersions = useCallback(async () => {
        setDosboxVersions(await api.getDosboxVersions());
    }, []);

    const refreshProcesses = useCallback(async () => {
        setProcesses(await api.listProgramProcesses());
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

    const runProgram = useCallback(
        async (program: Program, version?: string) => {
            const name = version ?? defaultVersionName();
            if (!name) {
                throw new Error("No DOSBox version configured");
            }
            await api.runProgram({ program, dosboxVersion: name });
            await refreshProcesses();
        },
        [defaultVersionName, refreshProcesses],
    );

    const stopProgram = useCallback(
        async (program: Program) => {
            await api.stopProgram(program);
            await refreshProcesses();
        },
        [refreshProcesses],
    );

    const stopAllPrograms = useCallback(async () => {
        const stopped = await api.stopAllPrograms();
        await refreshProcesses();
        return stopped;
    }, [refreshProcesses]);

    const addPrograms = useCallback(async () => {
        const added = await api.addPrograms();
        await refresh();
        return added;
    }, [refresh]);

    const saveProgramInfo = useCallback(async (program: Program, info: ProgramInfo) => {
        const updated = await api.updateProgramInfo(program, info);
        setPrograms((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        return updated;
    }, []);

    const deleteProgram = useCallback(
        async (program: Program) => {
            await api.deleteProgram(program);
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
        programs,
        dosboxVersions,
        processes,
        summaries,
        setupState,
        loading,
        refresh,
        completeSetup,
        changeLibraryDirectory,
        runProgram,
        stopProgram,
        stopAllPrograms,
        addPrograms,
        saveProgramInfo,
        deleteProgram,
        addDosboxVersion,
        removeDosboxVersion,
        setDefaultDosboxVersion,
    };
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
