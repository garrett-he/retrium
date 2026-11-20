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
import { categoryLabel, useT } from "@/i18n";
import { api } from "@/lib/api";
import { importResultMessage, importResultSeverity, needsDecision } from "@/lib/importResult";
import type { Cart, ImportReport } from "@/types";

type SortKey = "recent" | "name" | "year";

/**
 * Filter sentinels, deliberately lower-case so they can never collide with a
 * real `program.category` value ("game", "utility", …) or with a display label.
 */
const ALL = "all";
const UNCATEGORIZED = "uncategorized";

/** Library home: stats overview, search, filters, grid/list views and quick actions. */
export function LibraryPage() {
    const t = useT();
    const { notify } = useSnackbar();
    const { carts, processes, launch, loadLaunch, runCart, stopCart, deleteCart, addCarts } = useCartsContext();

    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<string>(ALL);
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
            const inCategory = category === ALL || (cart.info.category ?? UNCATEGORIZED) === category;
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
        const values = new Set(carts.map((cart) => cart.info.category ?? UNCATEGORIZED));
        return [ALL, ...[...values].sort((a, b) => a.localeCompare(b))];
    }, [carts]);

    const categoryText = (value: string) => {
        if (value === ALL) {
            return t("library.filter.all");
        }
        return value === UNCATEGORIZED ? t("common.uncategorized") : categoryLabel(t, value);
    };

    const handleRun = (cart: Cart, targetId?: string) => {
        runCart(cart.id, targetId)
            .then((process) =>
                notify(t("library.toast.launched", { name: cart.info.name, target: process.targetLabel }), "success"),
            )
            .catch((error) => notify(String(error), "error"));
    };

    const actions: CartMenuActions = {
        run: handleRun,
        stop: (cart) => {
            stopCart(cart.id)
                .then(() => notify(t("library.toast.stopped", { name: cart.info.name }), "info"))
                .catch((error) => notify(String(error), "error"));
        },
        browse: (cart) => {
            api.openCartFolder(cart.id)
                .then(() => notify(t("library.toast.opened", { name: cart.info.name }), "info"))
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
            .then(() => notify(t("library.toast.deleted", { name: cart.info.name }), "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleAdd = () => {
        setAdding(true);
        addCarts()
            .then((result) => {
                if (result.imported.length === 0 && result.skipped.length === 0 && result.pending.length === 0) {
                    notify(t("library.toast.noneSelected"), "info");
                    return;
                }
                if (needsDecision(result)) {
                    setReport(result);
                } else {
                    notify(importResultMessage(result, t), importResultSeverity(result));
                }
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
                        placeholder={t("library.search.placeholder")}
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
                                        <IconButton
                                            size="small"
                                            aria-label={t("library.search.clear")}
                                            onClick={() => setQuery("")}
                                        >
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
                        label={t("library.filter.category")}
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                    >
                        {categories.map((cat) => (
                            <MenuItem key={cat} value={cat}>
                                {categoryText(cat)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        sx={{ minWidth: 180 }}
                        label={t("library.sort.label")}
                        value={sort}
                        onChange={(event) => setSort(event.target.value as SortKey)}
                    >
                        <MenuItem value="recent">{t("library.sort.recent")}</MenuItem>
                        <MenuItem value="name">{t("library.sort.name")}</MenuItem>
                        <MenuItem value="year">{t("library.sort.year")}</MenuItem>
                    </TextField>
                    <Tooltip title={view === "grid" ? t("library.view.toList") : t("library.view.toGrid")}>
                        <IconButton
                            aria-label={t("library.view.toggle")}
                            onClick={() => setView(view === "grid" ? "list" : "grid")}
                            sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px" }}
                        >
                            <MsIcon>{view === "grid" ? "view_list" : "grid_view"}</MsIcon>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={t("library.add")}>
                        <span>
                            <IconButton
                                aria-label={t("library.add")}
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
                            {t("library.empty.title")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {t("library.empty.body")}
                        </Typography>
                        <Button variant="contained" disabled={adding} onClick={handleAdd}>
                            {t("library.empty.action")}
                        </Button>
                    </Paper>
                ) : filtered.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
                        <MsIcon sx={{ fontSize: 44, color: "text.secondary" }}>search_off</MsIcon>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            {t("library.noMatch.title")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {t("library.noMatch.body")}
                        </Typography>
                        <Button
                            onClick={() => {
                                setQuery("");
                                setCategory(ALL);
                            }}
                        >
                            {t("library.noMatch.action")}
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
                        <Table size="small" aria-label={t("library.table.label")}>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("library.table.cart")}</TableCell>
                                    <TableCell>{t("library.table.category")}</TableCell>
                                    <TableCell>{t("library.table.year")}</TableCell>
                                    <TableCell>{t("library.table.revision")}</TableCell>
                                    <TableCell>{t("library.table.playtime")}</TableCell>
                                    <TableCell>{t("library.table.runs")}</TableCell>
                                    <TableCell>{t("library.table.status")}</TableCell>
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
                <DialogTitle>{t("library.delete.title", { name: deleting?.info.name ?? "" })}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t("library.delete.body")}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
                    <Button color="error" variant="contained" onClick={confirmDelete}>
                        {t("library.delete.confirm")}
                    </Button>
                </DialogActions>
            </Dialog>

            <ExportDialog cart={exporting} onClose={() => setExporting(null)} />

            {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}
        </Box>
    );
}
