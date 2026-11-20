import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { CartCard } from "@/components/CartCard";
import type { CartMenuActions } from "@/components/CartMenu";
import { CartRow } from "@/components/CartRow";
import { ExportDialog } from "@/components/ExportDialog";
import { ImportReportDialog } from "@/components/ImportReportDialog";
import { MsIcon } from "@/components/MsIcon";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { api } from "@/lib/api";
import type { Cart, ImportReport } from "@/types";

type SortKey = "recent" | "name" | "year";

/** Library home: stats overview, search, filters, grid/list views and quick actions. */
export function LibraryPage() {
    const { notify } = useSnackbar();
    const { carts, processes, launch, loadLaunch, runCart, stopCart, deleteCart, addCarts } = useCartsContext();

    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("All");
    const [sort, setSort] = useState<SortKey>("recent");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState<Cart | null>(null);
    const [exporting, setExporting] = useState<Cart | null>(null);
    const [report, setReport] = useState<ImportReport | null>(null);

    const runningIds = useMemo(() => new Set(processes.map((process) => process.cartId)), [processes]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const list = carts.filter((cart) => {
            const inCategory = category === "All" || (cart.info.category ?? "Uncategorized") === category;
            const haystack = [cart.info.name, cart.info.developer, ...(cart.info.tags ?? [])].join(" ").toLowerCase();
            return inCategory && (needle.length === 0 || haystack.includes(needle));
        });
        return [...list].sort((a, b) => {
            if (sort === "name") {
                return a.info.name.localeCompare(b.info.name);
            }
            if (sort === "year") {
                return (a.info.release ?? 0) - (b.info.release ?? 0);
            }
            return (b.summary?.lastRun ?? "").localeCompare(a.summary?.lastRun ?? "");
        });
    }, [carts, query, category, sort]);

    const categories = useMemo(() => {
        const values = new Set(carts.map((cart) => cart.info.category ?? "Uncategorized"));
        return ["All", ...[...values].sort((a, b) => a.localeCompare(b))];
    }, [carts]);

    const handleRun = (cart: Cart, targetId?: string) => {
        runCart(cart.id, targetId)
            .then((process) => notify(`Launched ${cart.info.name} · ${process.targetLabel}`, "success"))
            .catch((error) => notify(String(error), "error"));
    };

    const actions: CartMenuActions = {
        run: handleRun,
        stop: (cart) => {
            stopCart(cart.id)
                .then(() => notify(`${cart.info.name} stopped`, "info"))
                .catch((error) => notify(String(error), "error"));
        },
        browse: (cart) => {
            api.openCartFolder(cart.id)
                .then(() => notify(`Opened ${cart.info.name} folder`, "info"))
                .catch((error) => notify(String(error), "error"));
        },
        exportCart: (cart) => setExporting(cart),
        loadTargets: (cart) => {
            if (!launch[cart.id]) {
                loadLaunch(cart.id).catch((error) => notify(String(error), "error"));
            }
        },
        delete: (cart) => setDeleting(cart),
    };

    const confirmDelete = () => {
        const cart = deleting;
        setDeleting(null);
        if (!cart) {
            return;
        }
        deleteCart(cart.id)
            .then(() => notify(`${cart.info.name} deleted`, "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleAdd = () => {
        setAdding(true);
        addCarts()
            .then((result) => {
                if (result.imported.length === 0 && result.skipped.length === 0 && result.pending.length === 0) {
                    notify("No carts selected", "info");
                    return;
                }
                setReport(result);
            })
            .catch((error) => notify(String(error), "error"))
            .finally(() => setAdding(false));
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 1200, mx: "auto" }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Search by name, developer or tag…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <MsIcon sx={{ fontSize: 20 }}>search</MsIcon>
                                </InputAdornment>
                            ),
                            endAdornment:
                                query.length > 0 ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" aria-label="Clear search" onClick={() => setQuery("")}>
                                            <MsIcon sx={{ fontSize: 18 }}>close</MsIcon>
                                        </IconButton>
                                    </InputAdornment>
                                ) : undefined,
                        }}
                    />
                    <TextField
                        select
                        size="small"
                        sx={{ minWidth: 180 }}
                        label="Category"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                    >
                        {categories.map((cat) => (
                            <MenuItem key={cat} value={cat}>
                                {cat}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        sx={{ minWidth: 180 }}
                        label="Sort"
                        value={sort}
                        onChange={(event) => setSort(event.target.value as SortKey)}
                    >
                        <MenuItem value="recent">Recently played</MenuItem>
                        <MenuItem value="name">Name A–Z</MenuItem>
                        <MenuItem value="year">Release year</MenuItem>
                    </TextField>
                    <Tooltip title={view === "grid" ? "Switch to list view" : "Switch to grid view"}>
                        <IconButton
                            aria-label="Toggle view"
                            onClick={() => setView(view === "grid" ? "list" : "grid")}
                            sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px" }}
                        >
                            <MsIcon>{view === "grid" ? "view_list" : "grid_view"}</MsIcon>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Add carts">
                        <span>
                            <IconButton
                                aria-label="Add carts"
                                disabled={adding}
                                onClick={handleAdd}
                                sx={{
                                    borderRadius: "10px",
                                    bgcolor: "primary.main",
                                    color: "primary.contrastText",
                                    "&:hover": { bgcolor: "primary.dark" },
                                }}
                            >
                                <MsIcon>add</MsIcon>
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>

                {carts.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
                        <MsIcon sx={{ fontSize: 44, color: "text.secondary" }}>inventory_2</MsIcon>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            The shelf is empty
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Import a .cart file to put something on it.
                        </Typography>
                        <Button variant="contained" disabled={adding} onClick={handleAdd}>
                            Import .cart
                        </Button>
                    </Paper>
                ) : filtered.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
                        <MsIcon sx={{ fontSize: 44, color: "text.secondary" }}>search_off</MsIcon>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            Nothing on this shelf
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            No cart matches your filters.
                        </Typography>
                        <Button
                            onClick={() => {
                                setQuery("");
                                setCategory("All");
                            }}
                        >
                            Clear filters
                        </Button>
                    </Paper>
                ) : view === "grid" ? (
                    <Box
                        sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(2, 1fr)",
                                md: "repeat(3, 1fr)",
                                lg: "repeat(4, 1fr)",
                            },
                        }}
                    >
                        {filtered.map((cart) => (
                            <CartCard
                                key={cart.id}
                                cart={cart}
                                running={runningIds.has(cart.id)}
                                targets={launch[cart.id]?.targets}
                                actions={actions}
                            />
                        ))}
                    </Box>
                ) : (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small" aria-label="Cart list">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Cart</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Year</TableCell>
                                    <TableCell>Revision</TableCell>
                                    <TableCell>Playtime</TableCell>
                                    <TableCell>Runs</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map((cart) => (
                                    <CartRow
                                        key={cart.id}
                                        cart={cart}
                                        running={runningIds.has(cart.id)}
                                        targets={launch[cart.id]?.targets}
                                        actions={actions}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            <Dialog open={deleting !== null} onClose={() => setDeleting(null)}>
                <DialogTitle>Delete “{deleting?.info.name}”?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Its archive, its installed copy and every save file written during a run will be removed. This
                        cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={confirmDelete}>
                        Delete permanently
                    </Button>
                </DialogActions>
            </Dialog>

            <ExportDialog cart={exporting} onClose={() => setExporting(null)} />

            {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}
        </Box>
    );
}
