import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoverArt } from "@/components/CoverArt";
import { MsIcon } from "@/components/MsIcon";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { useT } from "@/i18n";
import { formatUptime } from "@/lib/format";
import type { Cart } from "@/types";

/** Live view of every DOSBox process Retrium is tracking. */
export function RunningPage() {
    const t = useT();
    const navigate = useNavigate();
    const { notify } = useSnackbar();
    const { carts, processes, stopCart, stopAllCarts } = useCartsContext();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const byId = useMemo(() => new Map(carts.map((cart) => [cart.id, cart])), [carts]);

    const handleStop = (id: string, name: string) => {
        stopCart(id)
            .then(() => notify(t("library.toast.stopped", { name }), "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleStopAll = () => {
        stopAllCarts()
            .then((count) => notify(count > 0 ? t("running.stopped", { count }) : t("running.nothingToStop"), "info"))
            .catch((error) => notify(String(error), "error"));
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 1200, mx: "auto" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        {processes.length > 0 ? t("running.summary", { count: processes.length }) : t("running.idle")}
                    </Typography>
                    {processes.length > 1 && (
                        <Button color="error" startIcon={<MsIcon>stop_circle</MsIcon>} onClick={handleStopAll}>
                            {t("running.stopAll")}
                        </Button>
                    )}
                </Stack>

                {processes.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
                        <MsIcon sx={{ fontSize: 44, color: "text.secondary" }}>monitor</MsIcon>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            {t("running.empty.title")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {t("running.empty.body")}
                        </Typography>
                        <Button variant="contained" onClick={() => navigate("/")}>
                            {t("running.empty.action")}
                        </Button>
                    </Paper>
                ) : (
                    <Stack spacing={2}>
                        {processes.map((process) => {
                            const cart: Cart | undefined = byId.get(process.cartId);
                            const name = cart?.info.name ?? process.cartId;
                            return (
                                <Paper
                                    key={process.cartId}
                                    variant="outlined"
                                    sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
                                >
                                    <Placeholder cart={cart} />
                                    <Box sx={{ minWidth: 180, flexGrow: 1 }}>
                                        <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                                        >
                                            {t("running.pid", { pid: process.pid, target: process.targetLabel })}
                                        </Typography>
                                    </Box>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <MsIcon sx={{ fontSize: 18, color: "success.main" }}>timer</MsIcon>
                                        <Typography
                                            sx={{
                                                fontFamily: '"IBM Plex Mono", monospace',
                                                fontWeight: 600,
                                                fontSize: 15,
                                            }}
                                        >
                                            {formatUptime(process.startedAt, now)}
                                        </Typography>
                                    </Stack>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        startIcon={<MsIcon>stop</MsIcon>}
                                        onClick={() => handleStop(process.cartId, name)}
                                    >
                                        {t("common.stop")}
                                    </Button>
                                </Paper>
                            );
                        })}
                    </Stack>
                )}
            </Box>
        </Box>
    );
}

/** The cover needs the full cart; the process list only knows its id. */
function Placeholder({ cart }: { cart: Cart | undefined }) {
    if (cart) {
        return <CoverArt cart={cart} height={56} glyphSize={28} radius="8px" />;
    }
    return (
        <Box
            sx={{
                width: 56,
                height: 56,
                borderRadius: "8px",
                bgcolor: "action.hover",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <MsIcon sx={{ fontSize: 28, color: "text.secondary" }}>videogame_asset</MsIcon>
        </Box>
    );
}
