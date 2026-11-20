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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ActivityBars } from "@/components/ActivityBars";
import { CoverArt } from "@/components/CoverArt";
import { EditCartDialog } from "@/components/EditCartDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { MsIcon } from "@/components/MsIcon";
import { RunningChip } from "@/components/RunningChip";
import { RunSplitButton } from "@/components/RunSplitButton";
import { useCartsContext, useRunning } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { categoryLabel, type TFunction, useT } from "@/i18n";
import { api } from "@/lib/api";
import { formatDateTime, formatPlaytime } from "@/lib/format";
import type { Author, CartInfo } from "@/types";

type ConfirmAction = "reset" | "repair" | "delete";

/** Cart detail: hero, run controls, stats, metadata, editing and lifecycle. */
export function CartPage() {
    const t = useT();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { notify } = useSnackbar();
    const { carts, processes, runCart, stopCart, saveCartInfo, deleteCart, resetCart, repairCart } = useCartsContext();

    const [editing, setEditing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [confirming, setConfirming] = useState<ConfirmAction | null>(null);

    const cart = useMemo(() => carts.find((item) => item.id === id), [carts, id]);
    const process = useRunning(processes, id);
    const running = process !== undefined;

    if (!cart) {
        return (
            <Box className="fade-up">
                <Box sx={{ px: 3, py: 6, textAlign: "center" }}>
                    <Typography variant="h5">{t("cart.notFound.title")}</Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        {t("cart.notFound.body")}
                    </Typography>
                    <Button variant="contained" onClick={() => navigate("/")}>
                        {t("cart.notFound.action")}
                    </Button>
                </Box>
            </Box>
        );
    }

    const info = cart.info;
    const summary = cart.summary;
    const statCards = [
        { icon: "event", label: t("cart.stat.lastRun"), value: summary ? formatDateTime(summary.lastRun) : "—" },
        {
            icon: "schedule",
            label: t("cart.stat.playtime"),
            value: summary ? formatPlaytime(summary.elapsed) : "—",
        },
        { icon: "replay", label: t("cart.stat.runs"), value: summary ? `${summary.runs}×` : "—" },
    ];
    const infoRows: Array<[string, string | number | undefined]> = [
        [t("cart.info.category"), info.category === undefined ? undefined : categoryLabel(t, info.category)],
        [t("cart.info.release"), info.release],
        [t("cart.info.language"), info.language],
        [t("cart.info.players"), info.players],
        [t("cart.info.platform"), info.platform],
        [t("cart.info.dos"), info.dos?.version],
    ];
    const extraRows: Array<[string, string | number | undefined, boolean?]> = [
        [t("cart.meta.developer"), info.developer],
        [t("cart.meta.publisher"), info.publisher],
        [t("cart.meta.series"), info.series],
        [t("cart.meta.author"), cart.author?.name],
        [t("cart.meta.created"), formatDateTime(cart.createdAt)],
        [t("cart.meta.revision"), cart.revision],
        [t("cart.meta.id"), cart.id, true],
    ];

    const handleStop = () => {
        stopCart(cart.id)
            .then(() => notify(t("library.toast.stopped", { name: info.name }), "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleBrowse = () => {
        api.openCartFolder(cart.id)
            .then(() => notify(t("library.toast.opened", { name: info.name }), "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleSave = (targetId: string, updatedInfo: CartInfo, author?: Author) => {
        setEditing(false);
        return saveCartInfo(targetId, updatedInfo, author)
            .then(() => notify(t("cart.toast.metadataSaved"), "success"))
            .catch((error) => notify(String(error), "error"));
    };

    const runConfirm = () => {
        const action = confirming;
        setConfirming(null);
        if (!action) {
            return;
        }
        if (action === "delete") {
            deleteCart(cart.id)
                .then(() => {
                    notify(t("library.toast.deleted", { name: info.name }), "info");
                    navigate("/");
                })
                .catch((error) => notify(String(error), "error"));
            return;
        }
        const work = action === "reset" ? resetCart(cart.id) : repairCart(cart.id);
        work.then(() => notify(t(action === "reset" ? "cart.toast.reset" : "cart.toast.repaired"), "success")).catch(
            (error) => notify(String(error), "error"),
        );
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 1200, mx: "auto" }}>
                <Button
                    startIcon={<MsIcon>arrow_back</MsIcon>}
                    onClick={() => navigate("/")}
                    sx={{ mb: 2, color: "text.secondary" }}
                >
                    {t("nav.library")}
                </Button>

                <Box sx={{ position: "relative", mb: 3 }}>
                    <CoverArt cart={cart} height={230} glyphSize={96} radius="16px" />
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
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                            <Typography
                                variant="body2"
                                sx={{ color: "rgba(236,229,218,0.85)", fontFamily: '"IBM Plex Mono", monospace' }}
                            >
                                {t("cart.hero.meta", {
                                    release: info.release ?? "—",
                                    category: categoryLabel(t, info.category),
                                    developer: info.developer ?? "—",
                                })}
                            </Typography>
                            <RevisionBadge revision={cart.revision} dirty={cart.dirty} />
                        </Stack>
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
                            {t("common.stop")}
                        </Button>
                    ) : (
                        <RunSplitButton
                            cartId={cart.id}
                            running={running}
                            onRun={(targetId) =>
                                runCart(cart.id, targetId)
                                    .then((started) =>
                                        notify(
                                            t("library.toast.launched", {
                                                name: info.name,
                                                target: started.targetLabel,
                                            }),
                                            "success",
                                        ),
                                    )
                                    .catch((error) => notify(String(error), "error"))
                            }
                        />
                    )}
                    <Button variant="outlined" startIcon={<MsIcon>folder_open</MsIcon>} onClick={handleBrowse}>
                        {t("common.browse")}
                    </Button>
                    <Button variant="outlined" startIcon={<MsIcon>io</MsIcon>} onClick={() => setExporting(true)}>
                        {t("cart.action.export")}
                    </Button>
                    <Button variant="outlined" startIcon={<MsIcon>edit</MsIcon>} onClick={() => setEditing(true)}>
                        {t("cart.action.edit")}
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<MsIcon>delete</MsIcon>}
                        onClick={() => setConfirming("delete")}
                        sx={{ ml: "auto" }}
                    >
                        {t("common.delete")}
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
                            {t("cart.info.title")}
                        </Typography>
                        {infoRows.map(([key, value]) => (
                            <InfoRow key={key} label={key} value={value} />
                        ))}
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                            {t("cart.meta.title")}
                        </Typography>
                        {extraRows.map(([key, value, mono]) => (
                            <InfoRow key={key} label={key} value={value} mono={mono === true} />
                        ))}
                    </Paper>
                </Box>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.1fr 1.4fr" } }}>
                    <ActivityBars />
                    <Stack spacing={2}>
                        <Paper variant="outlined" sx={{ p: 2.5 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                                {t("cart.tags")}
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
                        <Paper variant="outlined" sx={{ p: 2.5 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                {t("cart.repair.title")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                {t("cart.repair.body")}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={running}
                                    onClick={() => setConfirming("reset")}
                                >
                                    {t("cart.repair.reset")}
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={running}
                                    onClick={() => setConfirming("repair")}
                                >
                                    {t("cart.repair.repair")}
                                </Button>
                            </Stack>
                        </Paper>
                    </Stack>
                </Box>
            </Box>

            <EditCartDialog
                cart={editing ? cart : null}
                onClose={() => setEditing(false)}
                onSave={(updatedInfo, author) => handleSave(cart.id, updatedInfo, author)}
            />

            <ExportDialog cart={exporting ? cart : null} onClose={() => setExporting(false)} />

            <Dialog open={confirming !== null} onClose={() => setConfirming(null)}>
                <DialogTitle>{confirmTitle(t, confirming, info.name)}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{confirmBody(t, confirming)}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirming(null)}>{t("common.cancel")}</Button>
                    <Button color="error" variant="contained" onClick={runConfirm}>
                        {confirmButton(t, confirming)}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function confirmTitle(t: TFunction, action: ConfirmAction | null, name: string): string {
    switch (action) {
        case "delete":
            return t("cart.confirm.delete.title", { name });
        case "reset":
            return t("cart.confirm.reset.title");
        case "repair":
            return t("cart.confirm.repair.title");
        default:
            return "";
    }
}

function confirmBody(t: TFunction, action: ConfirmAction | null): string {
    switch (action) {
        case "delete":
            return t("library.delete.body");
        case "reset":
            return t("cart.confirm.reset.body");
        case "repair":
            return t("cart.confirm.repair.body");
        default:
            return "";
    }
}

function confirmButton(t: TFunction, action: ConfirmAction | null): string {
    switch (action) {
        case "delete":
            return t("cart.confirm.delete.button");
        case "reset":
            return t("cart.confirm.reset.button");
        case "repair":
            return t("cart.confirm.repair.button");
        default:
            return "";
    }
}

function RevisionBadge({ revision, dirty }: { revision: number; dirty?: boolean }) {
    const t = useT();
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip
                size="small"
                label={`r${revision}`}
                sx={{
                    height: 20,
                    fontSize: 11,
                    fontFamily: '"IBM Plex Mono", monospace',
                    bgcolor: "rgba(236,229,218,0.16)",
                    color: "#ECE5DA",
                }}
            />
            {dirty && (
                <Tooltip title={t("cart.dirty.tooltip")}>
                    <Chip
                        size="small"
                        icon={<MsIcon sx={{ fontSize: 14 }}>edit_note</MsIcon>}
                        label={t("cart.dirty.unexported")}
                        sx={{
                            height: 20,
                            fontSize: 11,
                            bgcolor: "warning.main",
                            color: "warning.contrastText",
                            "& .MuiChip-icon": { color: "inherit" },
                        }}
                    />
                </Tooltip>
            )}
        </Stack>
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
