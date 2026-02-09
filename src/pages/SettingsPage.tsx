import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import { useProgramsContext } from "@/hooks/usePrograms";
import { useSnackbar } from "@/hooks/useSnackbar";
import { api } from "@/lib/api";
import type { ThemeMode } from "@/theme";

interface InfoRowProps {
    label: string;
    value: string;
    mono?: boolean;
}

function InfoRow({ label, value, mono = false }: InfoRowProps) {
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
                {value}
            </Typography>
        </Stack>
    );
}

/** Settings: storage, DOSBox version management, appearance and about. */
export function SettingsPage({ mode, onModeChange }: { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void }) {
    const { notify } = useSnackbar();
    const { dosboxVersions, setupState, addDosboxVersion, removeDosboxVersion, setDefaultDosboxVersion } =
        useProgramsContext();

    const [addOpen, setAddOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPath, setNewPath] = useState("");

    const handleAdd = () => {
        addDosboxVersion(newName.trim(), newPath.trim())
            .then(() => {
                setAddOpen(false);
                setNewName("");
                setNewPath("");
                notify("DOSBox version added", "success");
            })
            .catch((error) => notify(String(error), "error"));
    };

    const handleRemove = (name: string) => {
        removeDosboxVersion(name)
            .then(() => notify("DOSBox version removed", "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleSetDefault = (name: string) => {
        setDefaultDosboxVersion(name)
            .then(() => notify(`${name} is now the default DOSBox`, "success"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleChangeDirectory = () => {
        api.pickLibraryDirectory()
            .then((path) => {
                if (!path) {
                    return;
                }
                return api.setLibraryDirectory(path).then(() => notify(`Library moved to ${path}`, "success"));
            })
            .catch((error) => notify(String(error), "error"));
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 860, mx: "auto" }}>
                <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <MsIcon sx={{ color: "primary.main" }}>database</MsIcon>
                        <Typography variant="h6">Storage</Typography>
                    </Stack>
                    <InfoRow label="Library" value={setupState?.library ?? "—"} mono />
                    <InfoRow label="Programs" value="stored in per-program sub-folders with saved states" />
                    <Button size="small" variant="outlined" sx={{ mt: 1.5 }} onClick={handleChangeDirectory}>
                        Change directory
                    </Button>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <MsIcon sx={{ color: "primary.main" }}>memory</MsIcon>
                            <Typography variant="h6">DOSBox versions</Typography>
                        </Stack>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<MsIcon>add</MsIcon>}
                            onClick={() => setAddOpen(true)}
                        >
                            Add
                        </Button>
                    </Stack>
                    {dosboxVersions.versions.map((version) => {
                        const isDefault = version.name === dosboxVersions.default;
                        return (
                            <Stack
                                key={version.name}
                                direction="row"
                                alignItems="center"
                                spacing={1.5}
                                sx={{
                                    py: 1,
                                    borderBottom: "1px dashed",
                                    borderColor: "divider",
                                    ":last-child": { borderBottom: "none" },
                                }}
                            >
                                <Radio
                                    size="small"
                                    checked={isDefault}
                                    onChange={() => handleSetDefault(version.name)}
                                    inputProps={{ "aria-label": `Set ${version.name} as default` }}
                                    sx={{ color: "text.secondary" }}
                                />
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>
                                        {version.name}
                                        {isDefault && (
                                            <Chip
                                                size="small"
                                                label="default"
                                                sx={{
                                                    ml: 1,
                                                    height: 18,
                                                    fontSize: 10,
                                                    bgcolor: "primary.main",
                                                    color: "primary.contrastText",
                                                    fontFamily: '"IBM Plex Mono", monospace',
                                                }}
                                            />
                                        )}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ fontFamily: '"IBM Plex Mono", monospace', wordBreak: "break-all" }}
                                    >
                                        {version.path}
                                    </Typography>
                                </Box>
                                <Tooltip title={isDefault ? "Set another version as default first" : "Remove version"}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            aria-label={`Remove ${version.name}`}
                                            disabled={isDefault}
                                            onClick={() => handleRemove(version.name)}
                                            sx={{ color: "error.main" }}
                                        >
                                            <MsIcon sx={{ fontSize: 18 }}>delete</MsIcon>
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Stack>
                        );
                    })}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                        The default version is used by the main Run button.
                    </Typography>
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
                    <InfoRow label="Version" value="0.2.0" mono />
                    <InfoRow label="License" value="GPL-3.0-or-later" mono />
                    <InfoRow label="Platform" value="Windows · macOS · Linux (Tauri)" />
                </Paper>
            </Box>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add DOSBox version</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
                    <TextField
                        size="small"
                        label="Display name"
                        placeholder="e.g. DOSBox-X 2025.03"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                    />
                    <TextField
                        size="small"
                        label="Executable path"
                        placeholder="C:\DOSBox-X\dosbox-x.exe"
                        value={newPath}
                        onChange={(event) => setNewPath(event.target.value)}
                        InputProps={{
                            endAdornment: (
                                <Button
                                    size="small"
                                    onClick={() =>
                                        api.pickDosboxExecutable().then((path) => {
                                            if (path) {
                                                setNewPath(path);
                                            }
                                        })
                                    }
                                >
                                    Browse
                                </Button>
                            ),
                            sx: { fontFamily: '"IBM Plex Mono", monospace' },
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleAdd}
                        disabled={newName.trim().length === 0 || newPath.trim().length === 0}
                    >
                        Add version
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
