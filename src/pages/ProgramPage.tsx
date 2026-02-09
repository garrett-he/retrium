import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ActivityBars } from "@/components/ActivityBars";
import { CoverArt } from "@/components/CoverArt";
import { EditProgramDialog } from "@/components/EditProgramDialog";
import { MsIcon } from "@/components/MsIcon";
import { RunningChip } from "@/components/RunningChip";
import { RunSplitButton } from "@/components/RunSplitButton";
import { useProgramsContext } from "@/hooks/usePrograms";
import { useSnackbar } from "@/hooks/useSnackbar";
import { api } from "@/lib/api";
import { formatPlaytime } from "@/lib/format";
import type { Program, ProgramInfo } from "@/types";

/** Program detail: hero, run controls, stats, metadata, editing and safe delete. */
export function ProgramPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { notify } = useSnackbar();
    const { programs, dosboxVersions, processes, summaries, runProgram, stopProgram, saveProgramInfo, deleteProgram } =
        useProgramsContext();

    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const program = useMemo(() => programs.find((item) => item.id === id), [programs, id]);
    const running = useMemo(() => processes.some((process) => process.program.id === id), [processes, id]);
    const summary = program ? summaries[program.id] : undefined;

    if (!program) {
        return (
            <Box className="fade-up">
                <Box sx={{ px: 3, py: 6, textAlign: "center" }}>
                    <Typography variant="h5">Program not found</Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        The requested program could not be found.
                    </Typography>
                    <Button variant="contained" onClick={() => navigate("/")}>
                        Back to library
                    </Button>
                </Box>
            </Box>
        );
    }

    const info = program.info;
    const statCards = [
        { icon: "event", label: "Last run", value: summary ? summary.lastRun : "—" },
        { icon: "schedule", label: "Total playtime", value: summary ? formatPlaytime(summary.elapsed) : "—" },
        { icon: "replay", label: "Times played", value: summary ? `${summary.runs}×` : "—" },
    ];
    const infoRows: Array<[string, string | number | undefined]> = [
        ["Category", info.category],
        ["Release", info.release],
        ["Language", info.language],
    ];
    const extraRows: Array<[string, string | number | undefined, boolean?]> = [
        ["Developer", info.developer],
        ["Publisher", info.publisher],
        ["Series", info.series],
        ["Directory", program.dir, true],
    ];

    const handleRun = (version: string) => {
        runProgram(program, version)
            .then(() => notify(`Launched ${info.name} in DOSBox ${version}`, "success"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleStop = () => {
        stopProgram(program)
            .then(() => notify(`${info.name} stopped`, "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleBrowse = () => {
        api.openProgramFolder(program)
            .then(() => notify(`Opened ${program.dir}`, "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleExport = () => {
        api.archiveProgram(program)
            .then(() => notify(`Exported ${info.name}.zip`, "success"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleSave = (target: Program, updatedInfo: ProgramInfo) => {
        setEditing(false);
        return saveProgramInfo(target, updatedInfo)
            .then(() => notify("Metadata saved", "success"))
            .catch((error) => notify(String(error), "error"));
    };

    const confirmDelete = () => {
        setDeleting(false);
        deleteProgram(program)
            .then(() => {
                notify(`${info.name} deleted`, "info");
                navigate("/");
            })
            .catch((error) => notify(String(error), "error"));
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 1200, mx: "auto" }}>
                <Button
                    startIcon={<MsIcon>arrow_back</MsIcon>}
                    onClick={() => navigate("/")}
                    sx={{ mb: 2, color: "text.secondary" }}
                >
                    Library
                </Button>

                <Box sx={{ position: "relative", mb: 3 }}>
                    <CoverArt program={program} height={230} glyphSize={96} radius="16px" />
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "16px",
                            background: "linear-gradient(180deg, transparent 40%, rgba(20,17,14,0.92) 100%)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "flex-end",
                            p: 2.5,
                        }}
                    >
                        <Typography variant="h4" sx={{ color: "#ECE5DA" }}>
                            {info.name}
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{ color: "rgba(236,229,218,0.85)", fontFamily: '"IBM Plex Mono", monospace' }}
                        >
                            {info.release ?? "—"} · {info.category ?? "Uncategorized"} · {info.developer ?? "—"}
                        </Typography>
                    </Box>
                    {running && (
                        <Box sx={{ position: "absolute", top: 14, right: 14 }}>
                            <RunningChip />
                        </Box>
                    )}
                </Box>

                <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 4 }} useFlexGap>
                    {running ? (
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<MsIcon>stop</MsIcon>}
                            onClick={handleStop}
                        >
                            Stop
                        </Button>
                    ) : (
                        <RunSplitButton dosboxVersions={dosboxVersions} onRun={handleRun} />
                    )}
                    <Button variant="outlined" startIcon={<MsIcon>folder_open</MsIcon>} onClick={handleBrowse}>
                        Browse
                    </Button>
                    <Button variant="outlined" startIcon={<MsIcon>archive</MsIcon>} onClick={handleExport}>
                        Export
                    </Button>
                    <Button variant="outlined" startIcon={<MsIcon>edit</MsIcon>} onClick={() => setEditing(true)}>
                        Edit
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<MsIcon>delete</MsIcon>}
                        onClick={() => setDeleting(true)}
                        sx={{ ml: "auto" }}
                    >
                        Delete
                    </Button>
                </Stack>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, mb: 2 }}>
                    {statCards.map((card) => (
                        <Paper key={card.label} variant="outlined" sx={{ p: 2 }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <MsIcon sx={{ color: "primary.main" }}>{card.icon}</MsIcon>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">
                                        {card.label}
                                    </Typography>
                                    <Typography
                                        sx={{ fontWeight: 600, fontFamily: '"IBM Plex Mono", monospace', fontSize: 15 }}
                                    >
                                        {card.value}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    ))}
                </Box>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.1fr 1.4fr" }, mb: 2 }}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Information
                        </Typography>
                        {infoRows.map(([key, value]) => (
                            <InfoRow key={key} label={key} value={value} />
                        ))}
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Extra information
                        </Typography>
                        {extraRows.map(([key, value, mono]) => (
                            <InfoRow key={key} label={key} value={value} mono={mono === true} />
                        ))}
                    </Paper>
                </Box>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.1fr 1.4fr" } }}>
                    <ActivityBars />
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Tags
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                            {(info.tags ?? []).length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    —
                                </Typography>
                            ) : (
                                (info.tags ?? []).map((tag) => (
                                    <Chip
                                        key={tag}
                                        label={tag}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                            borderColor: "rgba(255,179,0,0.45)",
                                            color: "primary.main",
                                            fontFamily: '"IBM Plex Mono", monospace',
                                        }}
                                    />
                                ))
                            )}
                        </Stack>
                    </Paper>
                </Box>
            </Box>

            <EditProgramDialog
                program={editing ? program : null}
                onClose={() => setEditing(false)}
                onSave={handleSave}
            />

            <Dialog open={deleting} onClose={() => setDeleting(false)}>
                <DialogTitle>Delete “{info.name}”?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        The folder <strong style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{program.dir}</strong>{" "}
                        and its saved states will be removed permanently. This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(false)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={confirmDelete}>
                        Delete permanently
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function InfoRow({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: string | number | undefined;
    mono?: boolean;
}) {
    return (
        <Stack
            direction="row"
            sx={{
                py: 0.75,
                borderBottom: "1px dashed",
                borderColor: "divider",
                ":last-child": { borderBottom: "none" },
            }}
        >
            <Typography variant="body2" color="text.secondary" sx={{ width: 110, flexShrink: 0 }}>
                {label}
            </Typography>
            <Typography
                variant="body2"
                sx={{
                    fontWeight: 500,
                    fontFamily: mono ? '"IBM Plex Mono", monospace' : undefined,
                    wordBreak: "break-all",
                }}
            >
                {value ?? "—"}
            </Typography>
        </Stack>
    );
}
