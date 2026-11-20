import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { type CartMenuActions, CartMenuButton } from "@/components/CartMenu";
import { CoverArt } from "@/components/CoverArt";
import { MsIcon } from "@/components/MsIcon";
import { RunningChip } from "@/components/RunningChip";
import { formatPlaytime } from "@/lib/format";
import type { Cart, TargetInfo } from "@/types";

interface CartCardProps {
    cart: Cart;
    running: boolean;
    actions: CartMenuActions;
    targets?: TargetInfo[];
}

/** Grid card showing cover art, quick metadata and a kebab menu. */
export function CartCard({ cart, running, actions, targets }: CartCardProps) {
    const navigate = useNavigate();

    return (
        <Card
            sx={{
                position: "relative",
                "&:hover": { transform: "translateY(-4px)", boxShadow: "0 14px 30px -12px rgba(0,0,0,.5)" },
            }}
        >
            <CardActionArea onClick={() => navigate(`/carts/${cart.id}`)} sx={{ height: "100%" }}>
                <Box sx={{ position: "relative" }}>
                    <CoverArt cart={cart} height={132} glyphSize={54} />
                    {running && (
                        <Box sx={{ position: "absolute", top: 8, left: 8 }}>
                            <RunningChip small />
                        </Box>
                    )}
                </Box>
                <Box sx={{ p: 1.5, pr: 4.5 }}>
                    <Typography
                        sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                        {cart.info.name}
                    </Typography>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                    >
                        {cart.info.release ?? "—"} · {cart.info.category ?? "Uncategorized"} · r{cart.revision}
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                            <MsIcon sx={{ fontSize: 15 }}>schedule</MsIcon>
                            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                {cart.summary ? formatPlaytime(cart.summary.elapsed) : "—"}
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                            <MsIcon sx={{ fontSize: 15 }}>replay</MsIcon>
                            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                {cart.summary ? `${cart.summary.runs}×` : "—"}
                            </Typography>
                        </Stack>
                        {cart.dirty && (
                            <Tooltip title="Local changes have not been exported yet">
                                <MsIcon data-testid={`dirty-${cart.id}`} sx={{ fontSize: 15, color: "warning.main" }}>
                                    edit_note
                                </MsIcon>
                            </Tooltip>
                        )}
                    </Stack>
                </Box>
            </CardActionArea>
            <CartMenuButton
                cart={cart}
                running={running}
                targets={targets}
                actions={actions}
                sx={{ position: "absolute", top: 6, right: 6, color: "#fff", bgcolor: "rgba(23,20,18,0.55)" }}
            />
        </Card>
    );
}
