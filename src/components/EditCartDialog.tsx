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
import type { Cart, CartInfo } from "@/types";

const CATEGORIES = ["Action", "Strategy", "Simulation", "Puzzle", "Racing", "Uncategorized"];

interface EditCartDialogProps {
    cart: Cart | null;
    onClose: () => void;
    onSave: (cart: Cart, info: CartInfo) => Promise<void>;
}

type CartDraft = Omit<CartInfo, "tags"> & { tagsText: string };

/** Modal form for editing cart metadata; writes through to `.retrium/info.json`. */
export function EditCartDialog({ cart, onClose, onSave }: EditCartDialogProps) {
    const [draft, setDraft] = useState<CartDraft | null>(null);

    useEffect(() => {
        setDraft(cart ? { ...cart.info, tagsText: (cart.info.tags ?? []).join(", ") } : null);
    }, [cart]);

    if (!cart || !draft) {
        return null;
    }

    const set = <K extends keyof CartDraft>(key: K, value: CartDraft[K]) => {
        setDraft((current) => (current ? { ...current, [key]: value } : current));
    };

    const buildInfo = (): CartInfo => {
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
            <DialogTitle>Edit “{cart.info.name}”</DialogTitle>
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
                    onClick={() => onSave(cart, buildInfo())}
                >
                    Save changes
                </Button>
            </DialogActions>
        </Dialog>
    );
}
