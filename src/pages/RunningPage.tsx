import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoverArt } from "@/components/CoverArt";
import { MsIcon } from "@/components/MsIcon";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { formatUptime } from "@/lib/format";

/** Live view of every DOSBox process Retrium is tracking. */
export function RunningPage() {
    const navigate = useNavigate();
    const { notify } = useSnackbar();
    const { processes, stopCart, stopAllCarts } = useCartsContext();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleStop = (id: string, name: string) => {
        const cart = processes.find((process) => process.cart.id === id)?.cart;
        if (!cart) {
            return;
        }
        stopCart(cart)
            .then(() => notify(`${name} stopped`, "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleStopAll = () => {
        stopAllCarts()
            .then((count) =>
                notify(count > 0 ? `Stopped ${count} cart${count > 1 ? "s" : ""}` : "Nothing to stop", "info"),
            )
            .catch((error) => notify(String(error), "error"));
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 1200, mx: "auto" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        {processes.length > 0
                            ? `${processes.length} cart${processes.length > 1 ? "s" : ""} emulated in DOSBox`
                            : "The CRT is warm, but nothing is running."}
                    </Typography>
                    {processes.length > 1 && (
                        <Button color="error" startIcon={<MsIcon>stop_circle</MsIcon>} onClick={handleStopAll}>
                            Stop all
                        </Button>
                    )}
                </Stack>

                {processes.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
                        <MsIcon sx={{ fontSize: 44, color: "text.secondary" }}>monitor</MsIcon>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            Nothing is running
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Launch a cart from the library to see it here.
                        </Typography>
                        <Button variant="contained" onClick={() => navigate("/")}>
                            Go to library
                        </Button>
                    </Paper>
                ) : (
                    <Stack spacing={2}>
                        {processes.map((process) => (
                            <Paper
                                key={process.cart.id}
                                variant="outlined"
                                sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
                            >
                                <CoverArt cart={process.cart} height={56} glyphSize={28} radius="8px" />
                                <Box sx={{ minWidth: 180, flexGrow: 1 }}>
                                    <Typography sx={{ fontWeight: 600 }}>{process.cart.info.name}</Typography>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                                    >
                                        pid {process.pid} · DOSBox {process.dosboxVersion}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <MsIcon sx={{ fontSize: 18, color: "success.main" }}>timer</MsIcon>
                                    <Typography
                                        sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: 15 }}
                                    >
                                        {formatUptime(process.startedAt, now)}
                                    </Typography>
                                </Stack>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    size="small"
                                    startIcon={<MsIcon>stop</MsIcon>}
                                    onClick={() => handleStop(process.cart.id, process.cart.info.name)}
                                >
                                    Stop
                                </Button>
                            </Paper>
                        ))}
                    </Stack>
                )}
            </Box>
        </Box>
    );
}
