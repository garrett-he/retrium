import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState } from "react";
import type { Program, ProgramInfo } from "@/types";

const CATEGORIES = ["Action", "Strategy", "Simulation", "Puzzle", "Racing", "Uncategorized"];

interface EditProgramDialogProps {
    program: Program | null;
    onClose: () => void;
    onSave: (program: Program, info: ProgramInfo) => Promise<void>;
}

type ProgramDraft = Omit<ProgramInfo, "tags"> & { tagsText: string };

/** Modal form for editing program metadata; writes through to `.retrium/info.json`. */
export function EditProgramDialog({ program, onClose, onSave }: EditProgramDialogProps) {
    const [draft, setDraft] = useState<ProgramDraft | null>(null);

    useEffect(() => {
        setDraft(program ? { ...program.info, tagsText: (program.info.tags ?? []).join(", ") } : null);
    }, [program]);

    if (!program || !draft) {
        return null;
    }

    const set = <K extends keyof ProgramDraft>(key: K, value: ProgramDraft[K]) => {
        setDraft((current) => (current ? { ...current, [key]: value } : current));
    };

    const buildInfo = (): ProgramInfo => {
        const { tagsText, ...rest } = draft;
        return {
            ...rest,
            tags: tagsText
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
        };
    };

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={onClose}>
            <DialogTitle>Edit “{program.info.name}”</DialogTitle>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
                <TextField
                    label="Name"
                    size="small"
                    value={draft.name}
                    onChange={(event) => set("name", event.target.value)}
                />
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Release year"
                        size="small"
                        type="number"
                        sx={{ width: 150 }}
                        value={draft.release ?? ""}
                        onChange={(event) =>
                            set("release", event.target.value === "" ? undefined : Number(event.target.value))
                        }
                    />
                    <FormControl size="small" fullWidth>
                        <Select
                            value={draft.category ?? "Uncategorized"}
                            onChange={(event) => set("category", event.target.value)}
                        >
                            {CATEGORIES.map((category) => (
                                <MenuItem key={category} value={category}>
                                    {category}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Developer"
                        size="small"
                        fullWidth
                        value={draft.developer ?? ""}
                        onChange={(event) => set("developer", event.target.value)}
                    />
                    <TextField
                        label="Publisher"
                        size="small"
                        fullWidth
                        value={draft.publisher ?? ""}
                        onChange={(event) => set("publisher", event.target.value)}
                    />
                </Stack>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Series"
                        size="small"
                        fullWidth
                        value={draft.series ?? ""}
                        onChange={(event) => set("series", event.target.value)}
                    />
                    <TextField
                        label="Language"
                        size="small"
                        fullWidth
                        value={draft.language ?? ""}
                        onChange={(event) => set("language", event.target.value)}
                    />
                </Stack>
                <TextField
                    label="Tags (comma separated)"
                    size="small"
                    value={draft.tagsText}
                    onChange={(event) => set("tagsText", event.target.value)}
                    helperText="Shown as chips on the detail page"
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={draft.name.trim().length === 0}
                    onClick={() => onSave(program, buildInfo())}
                >
                    Save changes
                </Button>
            </DialogActions>
        </Dialog>
    );
}
