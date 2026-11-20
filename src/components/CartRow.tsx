import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { type CartMenuActions, CartMenuButton } from "@/components/CartMenu";
import { CoverArt } from "@/components/CoverArt";
import { RunningChip } from "@/components/RunningChip";
import { formatPlaytime } from "@/lib/format";
import type { Cart, CartSummary } from "@/types";

interface CartRowProps {
    cart: Cart;
    running: boolean;
    summary?: CartSummary;
    actions: CartMenuActions;
}

/** Compact table row used by the list view of the library. */
export function CartRow({ cart, running, summary, actions }: CartRowProps) {
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
            <TableCell>{cart.info.category ?? "Uncategorized"}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>{cart.info.release ?? "—"}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {summary ? formatPlaytime(summary.elapsed) : "—"}
            </TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {summary ? `${summary.runs}×` : "—"}
            </TableCell>
            <TableCell>{running ? <RunningChip small /> : "—"}</TableCell>
            <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                <CartMenuButton cart={cart} running={running} actions={actions} />
            </TableCell>
        </TableRow>
    );
}
