import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type FormEvent, useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import { type StringKey, useT } from "@/i18n";
import { api } from "@/lib/api";
import type { DosboxProbe, SetupState } from "@/types";

interface SetupPageProps {
    defaults: SetupState;
    onComplete: (library: string, dosbox: string) => Promise<void>;
    onFinished: () => void;
}

const STEPS: StringKey[] = ["setup.step.library", "setup.step.dosbox", "setup.step.ready"];

/** Two-step first-run wizard: where carts live, and which DOSBox launches them. */
export function SetupPage({ defaults, onComplete, onFinished }: SetupPageProps) {
    const t = useT();
    const [step, setStep] = useState(0);
    const [library, setLibrary] = useState(defaults.library);
    const [dosbox, setDosbox] = useState(defaults.dosbox);
    const [probe, setProbe] = useState<DosboxProbe | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pick = async (picker: () => Promise<string | null>, setValue: (value: string) => void) => {
        try {
            const path = await picker();
            if (path) {
                setValue(path);
            }
        } catch (err) {
            setError(String(err));
        }
    };

    const testDosbox = () => {
        const path = dosbox.trim();
        if (path.length === 0) {
            return;
        }
        api.probeDosboxPath(path)
            .then(setProbe)
            .catch((err: unknown) => setError(String(err)));
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await onComplete(library.trim(), dosbox.trim());
            setStep(2);
        } catch (err) {
            setError(String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: 6 }} className="fade-up">
            <Box sx={{ width: "100%", maxWidth: 560, mx: "auto", px: 2 }}>
                <Stack spacing={1} alignItems="center" sx={{ mb: 4 }}>
                    <MsIcon filled sx={{ fontSize: 44, color: "primary.main" }}>
                        terminal
                    </MsIcon>
                    <Typography variant="h4" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                        {t("setup.welcome")}
                    </Typography>
                    <Typography color="text.secondary" align="center">
                        {t("setup.intro")}
                    </Typography>
                </Stack>

                <Paper sx={{ p: { xs: 3, sm: 4 }, border: "1px solid", borderColor: "divider" }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 4 }}>
                        {STEPS.map((labelKey, index) => (
                            <Stack
                                key={labelKey}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                                sx={index > 0 ? { flexGrow: 1 } : undefined}
                            >
                                {index > 0 && (
                                    <Box
                                        sx={{ height: 2, flex: 1, bgcolor: index <= step ? "primary.main" : "divider" }}
                                    />
                                )}
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Box
                                        sx={{
                                            width: 26,
                                            height: 26,
                                            borderRadius: "50%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            bgcolor:
                                                index < step
                                                    ? "success.main"
                                                    : index === step
                                                      ? "primary.main"
                                                      : "transparent",
                                            border: index === step ? "none" : "2px solid",
                                            borderColor: "divider",
                                            color:
                                                index < step
                                                    ? "#fff"
                                                    : index === step
                                                      ? "primary.contrastText"
                                                      : "text.secondary",
                                            fontFamily: '"IBM Plex Mono", monospace',
                                            fontSize: 13,
                                            fontWeight: 600,
                                        }}
                                    >
                                        {index < step ? <MsIcon sx={{ fontSize: 16 }}>check</MsIcon> : index + 1}
                                    </Box>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: index === step ? 600 : 400,
                                            color: index === step ? "text.primary" : "text.secondary",
                                        }}
                                    >
                                        {t(labelKey)}
                                    </Typography>
                                </Stack>
                            </Stack>
                        ))}
                    </Stack>

                    {step === 0 && (
                        <Stack spacing={2} className="fade-up">
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {t("setup.library.question")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t("setup.library.body")}
                            </Typography>
                            <PathField
                                label={t("setup.library.label")}
                                placeholder={t("setup.library.placeholder")}
                                icon="folder"
                                value={library}
                                onChange={setLibrary}
                                onBrowse={() => pick(api.pickLibraryDirectory, setLibrary)}
                            />
                            <Button
                                data-testid="continue"
                                variant="contained"
                                size="large"
                                disabled={library.trim().length === 0}
                                onClick={() => setStep(1)}
                                sx={{ alignSelf: "flex-end", mt: 1 }}
                            >
                                {t("setup.continue")}
                            </Button>
                        </Stack>
                    )}

                    {step === 1 && (
                        <Stack spacing={2} className="fade-up">
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {t("setup.dosbox.question")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t("setup.dosbox.body")}
                            </Typography>
                            <PathField
                                label={t("setup.dosbox.label")}
                                placeholder={t("setup.dosbox.placeholder")}
                                icon="memory"
                                value={dosbox}
                                onChange={(value) => {
                                    setDosbox(value);
                                    setProbe(null);
                                }}
                                onBrowse={() => pick(api.pickDosboxExecutable, setDosbox)}
                                onBlur={testDosbox}
                            />
                            {probe !== null && (
                                <Typography variant="caption" color={probe.exists ? "success.main" : "error"}>
                                    {probe.exists
                                        ? probe.version
                                            ? t("settings.dosbox.found", { version: probe.version })
                                            : t("settings.dosbox.unknown")
                                        : t("settings.dosbox.missing", { path: probe.path })}
                                </Typography>
                            )}
                            {error && (
                                <Typography role="alert" variant="body2" color="error">
                                    {error}
                                </Typography>
                            )}
                            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                                <Button onClick={() => setStep(0)}>{t("common.back")}</Button>
                                <Button
                                    data-testid="start-scan"
                                    variant="contained"
                                    size="large"
                                    disabled={saving || dosbox.trim().length === 0}
                                    onClick={submit}
                                >
                                    {saving ? t("setup.saving") : t("setup.finish")}
                                </Button>
                            </Stack>
                        </Stack>
                    )}

                    {step === 2 && (
                        <Stack spacing={2} className="fade-up">
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {t("setup.ready.title")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t("setup.ready.before")}
                                <Box component="span" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                    {library}
                                </Box>
                                {t("setup.ready.after")}
                            </Typography>
                            <Button
                                data-testid="enter-library"
                                variant="contained"
                                size="large"
                                onClick={onFinished}
                                sx={{ alignSelf: "flex-end" }}
                            >
                                {t("setup.ready.action")}
                            </Button>
                        </Stack>
                    )}
                </Paper>
            </Box>
        </Box>
    );
}

interface PathFieldProps {
    label: string;
    placeholder: string;
    icon: string;
    value: string;
    onChange: (value: string) => void;
    onBrowse: () => void;
    onBlur?: () => void;
}

function PathField({ label, placeholder, icon, value, onChange, onBrowse, onBlur }: PathFieldProps) {
    const t = useT();
    return (
        <TextField
            label={label}
            fullWidth
            variant="outlined"
            size="small"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            InputProps={{
                startAdornment: <MsIcon sx={{ fontSize: 20, mr: 1 }}>{icon}</MsIcon>,
                endAdornment: (
                    <Button size="small" onClick={onBrowse}>
                        {t("common.browse")}
                    </Button>
                ),
                sx: { fontFamily: '"IBM Plex Mono", monospace' },
            }}
        />
    );
}
