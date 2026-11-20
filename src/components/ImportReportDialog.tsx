import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { MsIcon } from "@/components/MsIcon";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { type StringKey, useT } from "@/i18n";
import type { ImportDecision, ImportReport, PendingImport } from "@/types";

interface ImportReportDialogProps {
    report: ImportReport;
    onClose: () => void;
}

const ACTION_KEY: Record<ImportDecision, StringKey> = {
    upgrade: "import.action.upgrade",
    conflict: "import.action.conflict",
    downgrade: "import.action.downgrade",
    duplicate: "import.action.duplicate",
};

const DECISION_KEY: Record<ImportDecision, StringKey> = {
    upgrade: "import.decision.upgrade",
    conflict: "import.decision.conflict",
    downgrade: "import.decision.downgrade",
    duplicate: "import.decision.duplicate",
};

/**
 * What a batch of cart files turned into: imported, skipped, or waiting for a
 * human. Nothing ambiguous is applied on its own — every pending row defaults to
 * being skipped, and only an explicit click applies it.
 */
export function ImportReportDialog({ report, onClose }: ImportReportDialogProps) {
    const t = useT();
    const { notify } = useSnackbar();
    const { resolveImport } = useCartsContext();

    const [pending, setPending] = useState<PendingImport[]>(report.pending);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const drop = (item: PendingImport) => setPending((list) => list.filter((row) => row.archive !== item.archive));

    const apply = (item: PendingImport) => {
        setBusyId(item.archive);
        resolveImport(item.archive, "apply")
            .then((cart) => {
                drop(item);
                notify(
                    cart ? t("import.toast.imported", { name: cart.info.name }) : t("import.toast.importedAnon"),
                    "success",
                );
            })
            .catch((err: unknown) => setErrors((map) => ({ ...map, [item.archive]: String(err) })))
            .finally(() => setBusyId(null));
    };

    return (
        <Dialog open maxWidth="md" fullWidth onClose={onClose}>
            <DialogTitle>{t("import.title")}</DialogTitle>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Stack direction="row" spacing={1}>
                    <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        label={t("import.chip.imported", { count: report.imported.length })}
                    />
                    <Chip
                        size="small"
                        variant="outlined"
                        label={t("import.chip.skipped", { count: report.skipped.length })}
                    />
                    <Chip
                        size="small"
                        color={pending.length > 0 ? "warning" : "default"}
                        variant="outlined"
                        label={t("import.chip.pending", { count: pending.length })}
                    />
                </Stack>

                {report.imported.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {t("import.added")}
                        </Typography>
                        {report.imported.map((cart) => (
                            <Stack key={cart.id} direction="row" spacing={1} alignItems="center">
                                <MsIcon sx={{ fontSize: 16, color: "success.main" }}>check_circle</MsIcon>
                                <Typography variant="body2">
                                    {t("import.added.row", { name: cart.info.name, revision: cart.revision })}
                                </Typography>
                            </Stack>
                        ))}
                    </Box>
                )}

                {report.skipped.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {t("import.refused")}
                        </Typography>
                        {report.skipped.map((note) => (
                            <Stack key={note.archive} sx={{ mb: 0.75 }}>
                                <Typography
                                    variant="caption"
                                    sx={{ fontFamily: '"IBM Plex Mono", monospace', wordBreak: "break-all" }}
                                >
                                    {note.archive}
                                </Typography>
                                <Typography variant="body2" color="error">
                                    {note.reason}
                                </Typography>
                            </Stack>
                        ))}
                    </Box>
                )}

                {pending.length > 0 && (
                    <>
                        <Divider />
                        <Typography variant="subtitle2" color="text.secondary">
                            {t("import.pending.title")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t("import.pending.body")}
                        </Typography>
                        {pending.map((item) => (
                            <Box
                                key={item.archive}
                                sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px", p: 1.5 }}
                            >
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                                    <Typography sx={{ fontWeight: 600 }}>{item.name}</Typography>
                                    <Chip size="small" label={t(DECISION_KEY[item.decision])} />
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                                    >
                                        {t("import.revisionFlow", {
                                            from: item.existingRevision ?? "—",
                                            to: item.incomingRevision,
                                        })}
                                    </Typography>
                                </Stack>
                                <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                    {item.archive}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {item.message}
                                </Typography>
                                {errors[item.archive] && (
                                    <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                                        {errors[item.archive]}
                                    </Typography>
                                )}
                                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} justifyContent="flex-end">
                                    <Button size="small" disabled={busyId === item.archive} onClick={() => drop(item)}>
                                        {t("common.skip")}
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        color={item.decision === "conflict" ? "warning" : "primary"}
                                        disabled={busyId === item.archive}
                                        onClick={() => apply(item)}
                                    >
                                        {t(ACTION_KEY[item.decision])}
                                    </Button>
                                </Stack>
                            </Box>
                        ))}
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button variant="contained" onClick={onClose}>
                    {t("common.done")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
