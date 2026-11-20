import Box from "@mui/material/Box";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { type CartMenuActions, CartMenuButton } from "@/components/CartMenu";
import { CoverArt } from "@/components/CoverArt";
import { MsIcon } from "@/components/MsIcon";
import { RunningChip } from "@/components/RunningChip";
import { categoryLabel, useT } from "@/i18n";
import { formatPlaytime } from "@/lib/format";
import type { Cart, TargetInfo } from "@/types";

interface CartRowProps {
    cart: Cart;
    running: boolean;
    actions: CartMenuActions;
    targets?: TargetInfo[];
}

/** Compact table row used by the list view of the library. */
export function CartRow({ cart, running, actions, targets }: CartRowProps) {
    const t = useT();
    const navigate = useNavigate();

    return (
        <TableRow hover onClick={() => navigate(`/carts/${cart.id}`)} sx={{ cursor: "pointer" }}>
            <TableCell>
                <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 12 }}>
                    <CoverArt cart={cart} height={40} glyphSize={20} radius="6px" thumbnail />
                </span>
                <Typography component="span" sx={{ fontWeight: 600 }}>
                    {cart.info.name}
                </Typography>
            </TableCell>
            <TableCell>{categoryLabel(t, cart.info.category)}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>{cart.info.release ?? "—"}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>r{cart.revision}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {cart.summary ? formatPlaytime(cart.summary.elapsed) : "—"}
            </TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {cart.summary ? `${cart.summary.runs}×` : "—"}
            </TableCell>
            <TableCell>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {running && <RunningChip small />}
                    {cart.dirty && (
                        <Tooltip title={t("cart.dirty.tooltip")}>
                            <MsIcon data-testid={`dirty-${cart.id}`} sx={{ fontSize: 16, color: "warning.main" }}>
                                edit_note
                            </MsIcon>
                        </Tooltip>
                    )}
                    {!running && !cart.dirty && "—"}
                </Box>
            </TableCell>
            <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                <CartMenuButton cart={cart} running={running} targets={targets} actions={actions} />
            </TableCell>
        </TableRow>
    );
}
