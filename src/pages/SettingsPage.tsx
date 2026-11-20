import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type ReactNode, useEffect, useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { api } from "@/lib/api";
import type { ThemeMode } from "@/theme";
import type { DosboxProbe } from "@/types";

interface InfoRowProps {
    label: string;
    value: string;
    mono?: boolean;
    action?: ReactNode;
}

function InfoRow({ label, value, mono = false, action }: InfoRowProps) {
    return (
        <Stack
            direction="row"
            alignItems="center"
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
                {value}
            </Typography>
            {action && <Box sx={{ ml: "auto", pl: 1, display: "flex", flexShrink: 0 }}>{action}</Box>}
        </Stack>
    );
}

/** Settings: storage, the single DOSBox path, appearance and about. */
export function SettingsPage({ mode, onModeChange }: { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void }) {
    const { notify } = useSnackbar();
    const { setupState, dosbox, changeLibraryDirectory, saveDosboxPath } = useCartsContext();

    const [path, setPath] = useState(dosbox?.path ?? "");
    const [probe, setProbe] = useState<DosboxProbe | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setPath(dosbox?.path ?? "");
        setProbe(dosbox);
    }, [dosbox]);

    const handleBrowse = () => {
        api.pickDosboxExecutable()
            .then((picked) => {
                if (picked) {
                    setPath(picked);
                    setProbe(null);
                }
            })
            .catch((error) => notify(String(error), "error"));
    };

    const handleTest = () => {
        setBusy(true);
        api.probeDosboxPath(path.trim())
            .then(setProbe)
            .catch((error) => notify(String(error), "error"))
            .finally(() => setBusy(false));
    };

    const handleSave = () => {
        setBusy(true);
        saveDosboxPath(path.trim())
            .then((result) => {
                setProbe(result);
                notify(
                    result.version ? `DOSBox ${result.version} saved` : "DOSBox path saved (version unknown)",
                    "success",
                );
            })
            .catch((error) => notify(String(error), "error"))
            .finally(() => setBusy(false));
    };

    const handleChangeDirectory = () => {
        api.pickLibraryDirectory()
            .then((picked) => {
                if (!picked) {
                    return;
                }
                return changeLibraryDirectory(picked).then(() => notify(`Library moved to ${picked}`, "success"));
            })
            .catch((error) => notify(String(error), "error"));
    };

    const dirty = path.trim() !== (dosbox?.path ?? "");

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 860, mx: "auto" }}>
                <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <MsIcon sx={{ color: "primary.main" }}>database</MsIcon>
                        <Typography variant="h6">Storage</Typography>
                    </Stack>
                    <InfoRow label="Library" value={setupState?.library ?? "—"} mono />
                    <InfoRow label="Carts" value="one archive plus one installed copy per cart" />
                    <Button size="small" variant="outlined" sx={{ mt: 1.5 }} onClick={handleChangeDirectory}>
                        Change directory
                    </Button>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <MsIcon sx={{ color: "primary.main" }}>memory</MsIcon>
                        <Typography variant="h6">DOSBox</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Retrium does not ship DOSBox. Point it at the executable you already have; every cart is
                        launched from it with its own configuration.
                    </Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="flex-start">
                        <TextField
                            label="Executable"
                            size="small"
                            fullWidth
                            placeholder="C:\DOSBox\dosbox.exe"
                            value={path}
                            onChange={(event) => setPath(event.target.value)}
                            InputProps={{ sx: { fontFamily: '"IBM Plex Mono", monospace' } }}
                        />
                        <Button onClick={handleBrowse} sx={{ flexShrink: 0 }}>
                            Browse
                        </Button>
                        <Button onClick={handleTest} disabled={busy || path.trim().length === 0} sx={{ flexShrink: 0 }}>
                            Test
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSave}
                            disabled={busy || path.trim().length === 0 || !dirty}
                            sx={{ flexShrink: 0 }}
                        >
                            Save
                        </Button>
                    </Stack>
                    {probe !== null && (
                        <Box sx={{ mt: 1.5 }}>
                            {probe.exists ? (
                                <Alert severity="success">
                                    {probe.version
                                        ? `Found DOSBox ${probe.version}`
                                        : "File found. Version unknown — Retrium will still launch it."}
                                </Alert>
                            ) : (
                                <Alert severity="error">No executable at {probe.path}</Alert>
                            )}
                        </Box>
                    )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                        <MsIcon sx={{ color: "primary.main" }}>palette</MsIcon>
                        <Typography variant="h6">Appearance</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        {(["dark", "light"] as const).map((themeMode) => (
                            <Paper
                                key={themeMode}
                                variant={mode === themeMode ? "elevation" : "outlined"}
                                elevation={mode === themeMode ? 4 : 0}
                                onClick={() => onModeChange(themeMode)}
                                sx={{
                                    flex: 1,
                                    p: 1.5,
                                    cursor: "pointer",
                                    textAlign: "center",
                                    border: mode === themeMode ? "2px solid" : "1px solid",
                                    borderColor: mode === themeMode ? "primary.main" : "divider",
                                }}
                            >
                                <MsIcon
                                    filled={mode === themeMode}
                                    sx={{ fontSize: 22, color: mode === themeMode ? "primary.main" : "text.secondary" }}
                                >
                                    {themeMode === "dark" ? "dark_mode" : "light_mode"}
                                </MsIcon>
                                <Typography variant="body2" sx={{ fontWeight: mode === themeMode ? 600 : 400 }}>
                                    {themeMode === "dark" ? "Terminal night" : "Yellowed manual"}
                                </Typography>
                            </Paper>
                        ))}
                    </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                        <MsIcon sx={{ color: "primary.main" }}>info</MsIcon>
                        <Typography variant="h6">About</Typography>
                    </Stack>
                    <InfoRow label="Cart format" value="version 1" mono />
                    <InfoRow label="License" value="GPL-3.0-or-later" mono />
                    <InfoRow
                        label="Homepage"
                        value="https://github.com/garrett-he/retrium"
                        action={
                            <Tooltip title="Open homepage">
                                <IconButton
                                    size="small"
                                    aria-label="Open homepage"
                                    onClick={() =>
                                        openUrl("https://github.com/garrett-he/retrium").catch((error) =>
                                            notify(String(error), "error"),
                                        )
                                    }
                                >
                                    <MsIcon sx={{ fontSize: 18 }}>open_in_new</MsIcon>
                                </IconButton>
                            </Tooltip>
                        }
                    />
                </Paper>
            </Box>
        </Box>
    );
}
