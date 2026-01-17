import { BarChart, Calendar, Clock, Download, FolderOpen, Pause, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ProgramCover } from "@/components/ProgramCover";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProgramsContext } from "@/hooks/usePrograms";
import { api } from "@/lib/api";
import type { ProgramProcess, ProgramSummary } from "@/types";

export function ProgramPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { programs, dosboxVersions, refresh } = useProgramsContext();

    const program = useMemo(() => programs.find((item) => item.id === id), [programs, id]);

    const [summary, setSummary] = useState<ProgramSummary | null>(null);
    const [process, setProcess] = useState<ProgramProcess | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!program) {
            return;
        }
        api.getProgramSummary(program).then(setSummary);
        api.getProgramProcess(program).then(setProcess);
    }, [program]);

    useEffect(() => {
        function onClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    const handleRun = useCallback(
        async (dosboxVersion: string) => {
            if (!program) {
                return;
            }
            setMenuOpen(false);
            const proc = await api.runProgram({ program, dosboxVersion });
            setProcess(proc);
        },
        [program],
    );

    const handleStop = useCallback(async () => {
        if (!program) {
            return;
        }
        await api.stopProgram(program);
        setProcess(null);
    }, [program]);

    const handleBrowse = useCallback(async () => {
        if (!program) {
            return;
        }
        await api.openProgramFolder(program);
    }, [program]);

    const handleExport = useCallback(async () => {
        if (!program) {
            return;
        }
        await api.archiveProgram(program);
    }, [program]);

    const handleDelete = useCallback(async () => {
        if (!program) {
            return;
        }
        if (!window.confirm(`Delete "${program.info.name}"? This cannot be undone.`)) {
            return;
        }
        await api.deleteProgram(program);
        await refresh();
        navigate("/");
    }, [program, navigate, refresh]);

    if (!program) {
        return (
            <>
                <PageHeader title="Program not found" showBack />
                <main className="container mx-auto p-4">
                    <p className="text-muted-foreground">The requested program could not be found.</p>
                </main>
            </>
        );
    }

    const versions = Object.keys(dosboxVersions);

    return (
        <>
            <PageHeader title={program.info.name} showBack />
            <main className="container mx-auto p-4">
                <ProgramCover program={program} className="mb-6 h-[400px] w-[800px] max-w-full object-contain" />

                <div className="mb-6 flex flex-wrap gap-2">
                    {process ? (
                        <Button variant="destructive" onClick={handleStop}>
                            <Pause className="mr-2 h-4 w-4" />
                            Stop
                        </Button>
                    ) : (
                        <div className="relative" ref={menuRef}>
                            <Button onClick={() => setMenuOpen((open) => !open)} disabled={versions.length === 0}>
                                <Play className="mr-2 h-4 w-4" />
                                Run
                            </Button>
                            {menuOpen && versions.length > 0 && (
                                <div className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md">
                                    {versions.map((version) => (
                                        <button
                                            key={version}
                                            type="button"
                                            className="block w-full rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent"
                                            onClick={() => handleRun(version)}
                                        >
                                            {version}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <Button variant="outline" onClick={handleBrowse}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Browse
                    </Button>
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </Button>
                    <Button variant="destructive" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </Button>
                </div>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>Last Run: {summary?.lastRun ?? "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>Seconds Run: {summary?.elapsed ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <BarChart className="h-4 w-4" />
                            <span>Run Times: {summary?.runs ?? 0}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div>Category: {program.info.category ?? "N/A"}</div>
                        <div>Release: {program.info.release ?? "N/A"}</div>
                        <div>Language: {program.info.language ?? "N/A"}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Extra Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div>Developer: {program.info.developer ?? "N/A"}</div>
                        <div>Publisher: {program.info.publisher ?? "N/A"}</div>
                        <div>Series: {program.info.series ?? "N/A"}</div>
                        <div>Tags: {program.info.tags?.length ? program.info.tags.join(", ") : "N/A"}</div>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
