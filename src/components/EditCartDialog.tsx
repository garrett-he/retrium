import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { Author, Cart, CartInfo } from "@/types";

/** The eight values `program.category` accepts. Anything else fails at import. */
const CATEGORIES = [
    "game",
    "application",
    "utility",
    "education",
    "demo",
    "development",
    "system",
    "reference",
] as const;

/** Common tags offered as completions; any valid BCP 47 tag is accepted. */
const LANGUAGES = [
    "en",
    "zh-Hans",
    "zh-Hant",
    "ja",
    "ko",
    "fr",
    "de",
    "es",
    "it",
    "pt",
    "ru",
    "pl",
    "nl",
    "sv",
    "fi",
    "cs",
    "hu",
];

interface EditCartDialogProps {
    cart: Cart | null;
    onClose: () => void;
    onSave: (info: CartInfo, author?: Author) => Promise<void>;
}

interface Draft {
    name: string;
    release: string;
    category: string;
    language: string;
    developer: string;
    publisher: string;
    series: string;
    players: string;
    platform: string;
    tagsText: string;
    dosVersion: string;
    dosInputText: string;
    externalIdsText: string;
    authorName: string;
    authorEmail: string;
}

function toDraft(cart: Cart): Draft {
    const info = cart.info;
    return {
        name: info.name,
        release: info.release === undefined ? "" : String(info.release),
        category: info.category ?? "",
        language: info.language ?? "",
        developer: info.developer ?? "",
        publisher: info.publisher ?? "",
        series: info.series ?? "",
        players: info.players === undefined ? "" : String(info.players),
        platform: info.platform ?? "",
        tagsText: (info.tags ?? []).join(", "),
        dosVersion: info.dos?.version ?? "",
        dosInputText: (info.dos?.input ?? []).join(", "),
        externalIdsText: Object.entries(info.externalIds ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
        authorName: cart.author?.name ?? "",
        authorEmail: cart.author?.email ?? "",
    };
}

/** Blank means "absent", never an empty string: the manifest stores omissions as omissions. */
function optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
}

function optionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function splitList(value: string): string[] | undefined {
    const items = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length === 0 ? undefined : items;
}

function parseExternalIds(value: string): Record<string, string> | undefined {
    const pairs: Record<string, string> = {};
    for (const line of value.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }
        const at = trimmed.indexOf("=");
        if (at <= 0) {
            continue;
        }
        const key = trimmed.slice(0, at).trim();
        const val = trimmed.slice(at + 1).trim();
        if (key.length > 0 && val.length > 0) {
            pairs[key] = val;
        }
    }
    return Object.keys(pairs).length === 0 ? undefined : pairs;
}

/** Modal form for editing `program.*` metadata and the optional `cart.author`. */
export function EditCartDialog({ cart, onClose, onSave }: EditCartDialogProps) {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(cart ? toDraft(cart) : null);
    }, [cart]);

    if (!cart || !draft) {
        return null;
    }

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
        setDraft((current) => (current ? { ...current, [key]: value } : current));
    };

    const dos = optional(draft.dosVersion) || optional(draft.dosInputText);
    const authorName = optional(draft.authorName);
    const authorEmail = optional(draft.authorEmail);

    const buildInfo = (): CartInfo => ({
        name: draft.name.trim(),
        release: optionalNumber(draft.release),
        category: optional(draft.category),
        language: optional(draft.language),
        developer: optional(draft.developer),
        publisher: optional(draft.publisher),
        series: optional(draft.series),
        players: optionalNumber(draft.players),
        platform: optional(draft.platform),
        tags: splitList(draft.tagsText),
        dos: dos
            ? {
                  version: optional(draft.dosVersion),
                  input: splitList(draft.dosInputText),
              }
            : undefined,
        externalIds: parseExternalIds(draft.externalIdsText),
    });

    const buildAuthor = (): Author | undefined =>
        authorName === undefined && authorEmail === undefined
            ? undefined
            : { name: authorName ?? "", email: authorEmail };

    const submit = () => {
        setSaving(true);
        onSave(buildInfo(), buildAuthor()).finally(() => setSaving(false));
    };

    const authorInvalid = authorEmail !== undefined && authorName === undefined;

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
                        value={draft.release}
                        onChange={(event) => set("release", event.target.value)}
                    />
                    <TextField
                        label="Players"
                        size="small"
                        type="number"
                        sx={{ width: 120 }}
                        value={draft.players}
                        onChange={(event) => set("players", event.target.value)}
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel id="cart-category">Category</InputLabel>
                        <Select
                            labelId="cart-category"
                            label="Category"
                            value={draft.category}
                            onChange={(event) => set("category", event.target.value)}
                        >
                            <MenuItem value="">
                                <em>Unset</em>
                            </MenuItem>
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
                        value={draft.developer}
                        onChange={(event) => set("developer", event.target.value)}
                    />
                    <TextField
                        label="Publisher"
                        size="small"
                        fullWidth
                        value={draft.publisher}
                        onChange={(event) => set("publisher", event.target.value)}
                    />
                </Stack>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Series"
                        size="small"
                        fullWidth
                        value={draft.series}
                        onChange={(event) => set("series", event.target.value)}
                    />
                    <Autocomplete
                        freeSolo
                        options={LANGUAGES}
                        value={draft.language}
                        onChange={(_, value) => set("language", value ?? "")}
                        onInputChange={(_, value) => set("language", value)}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Language"
                                size="small"
                                placeholder="BCP 47, e.g. en"
                                fullWidth
                            />
                        )}
                        sx={{ width: 220 }}
                    />
                </Stack>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Platform"
                        size="small"
                        fullWidth
                        placeholder="e.g. DOS"
                        value={draft.platform}
                        onChange={(event) => set("platform", event.target.value)}
                    />
                    <TextField
                        label="DOS version"
                        size="small"
                        fullWidth
                        placeholder="e.g. MS-DOS 5.0"
                        value={draft.dosVersion}
                        onChange={(event) => set("dosVersion", event.target.value)}
                    />
                </Stack>
                <TextField
                    label="DOS input"
                    size="small"
                    placeholder="e.g. Keyboard, Mouse"
                    value={draft.dosInputText}
                    onChange={(event) => set("dosInputText", event.target.value)}
                    helperText="Comma separated"
                />
                <TextField
                    label="Tags"
                    size="small"
                    value={draft.tagsText}
                    onChange={(event) => set("tagsText", event.target.value)}
                    helperText="Comma separated; shown as chips on the detail page"
                />
                <TextField
                    label="External ids"
                    size="small"
                    multiline
                    minRows={2}
                    placeholder={"mobygames=12345\nigdb=1029"}
                    value={draft.externalIdsText}
                    onChange={(event) => set("externalIdsText", event.target.value)}
                    helperText="One key=value per line"
                />
                <Typography variant="subtitle2" color="text.secondary">
                    Author
                </Typography>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Author name"
                        size="small"
                        fullWidth
                        value={draft.authorName}
                        onChange={(event) => set("authorName", event.target.value)}
                        error={authorInvalid}
                        helperText={authorInvalid ? "A name is required when an email is set" : undefined}
                    />
                    <TextField
                        label="Author email"
                        size="small"
                        fullWidth
                        value={draft.authorEmail}
                        onChange={(event) => set("authorEmail", event.target.value)}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={saving || draft.name.trim().length === 0 || authorInvalid}
                    onClick={submit}
                >
                    Save changes
                </Button>
            </DialogActions>
        </Dialog>
    );
}
