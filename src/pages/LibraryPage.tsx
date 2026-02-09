import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { MsIcon } from "@/components/MsIcon";
import { ProgramCard } from "@/components/ProgramCard";
import type { ProgramMenuActions } from "@/components/ProgramMenu";
import { ProgramRow } from "@/components/ProgramRow";
import { useProgramsContext } from "@/hooks/usePrograms";
import { useSnackbar } from "@/hooks/useSnackbar";
import { api } from "@/lib/api";
import { formatPlaytime } from "@/lib/format";
import type { Program } from "@/types";

const CATEGORIES = ["All", "Action", "Strategy", "Simulation", "Puzzle", "Racing"];

type SortKey = "recent" | "name" | "year";

/** Library home: stats overview, search, filters, grid/list views and quick actions. */
export function LibraryPage() {
    const { notify } = useSnackbar();
    const { programs, processes, summaries, runProgram, stopProgram, addPrograms, refresh } = useProgramsContext();

    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("All");
    const [sort, setSort] = useState<SortKey>("recent");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState<Program | null>(null);

    const runningIds = useMemo(() => new Set(processes.map((process) => process.program.id)), [processes]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const list = programs.filter((program) => {
            const inCategory = category === "All" || (program.info.category ?? "Uncategorized") === category;
            const haystack = [program.info.name, program.info.developer, ...(program.info.tags ?? [])]
                .join(" ")
                .toLowerCase();
            return inCategory && (needle.length === 0 || haystack.includes(needle));
        });
        return [...list].sort((a, b) => {
            if (sort === "name") {
                return a.info.name.localeCompare(b.info.name);
            }
            if (sort === "year") {
                return (a.info.release ?? 0) - (b.info.release ?? 0);
            }
            return (summaries[b.id]?.lastRun ?? "").localeCompare(summaries[a.id]?.lastRun ?? "");
        });
    }, [programs, query, category, sort, summaries]);

    const totalSeconds = Object.values(summaries).reduce((acc, summary) => acc + summary.elapsed, 0);
    const stats = [
        { icon: "apps", label: "Programs", value: String(programs.length) },
        { icon: "schedule", label: "Total playtime", value: formatPlaytime(totalSeconds) },
        { icon: "play_circle", label: "Running now", value: String(processes.length) },
        {
            icon: "category",
            label: "Categories",
            value: String(new Set(programs.map((program) => program.info.category ?? "Uncategorized")).size),
        },
    ];

    const actions: ProgramMenuActions = {
        run: (program) => {
            runProgram(program)
                .then(() => notify(`Launched ${program.info.name} in DOSBox`, "success"))
                .catch((error) => notify(String(error), "error"));
        },
        stop: (program) => {
            stopProgram(program)
                .then(() => notify(`${program.info.name} stopped`, "info"))
                .catch((error) => notify(String(error), "error"));
        },
        browse: (program) => {
            api.openProgramFolder(program)
                .then(() => notify(`Opened ${program.dir}`, "info"))
                .catch((error) => notify(String(error), "error"));
        },
        exportArchive: (program) => {
            api.archiveProgram(program)
                .then(() => notify(`Exported ${program.info.name}.zip`, "success"))
                .catch((error) => notify(String(error), "error"));
        },
        delete: (program) => setDeleting(program),
    };

    const confirmDelete = () => {
        const program = deleting;
        setDeleting(null);
        if (!program) {
            return;
        }
        api.deleteProgram(program)
            .then(() => refresh())
            .then(() => notify(`${program.info.name} deleted`, "info"))
            .catch((error) => notify(String(error), "error"));
    };

    const handleAdd = () => {
        setAdding(true);
        addPrograms()
            .then((added) =>
                notify(added.length > 0 ? `${added.length} new programs added` : "No new programs found", "success"),
            )
            .catch((error) => notify(String(error), "error"))
            .finally(() => setAdding(false));
    };

    return (
        <Box className="fade-up">
            <Box sx={{ px: 3, py: 3, maxWidth: 1200, mx: "auto" }}>
                <Box
                    sx={{
                        display: "grid",
                        gap: 2,
                        mb: 3,
                        gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
                    }}
                >
                    {stats.map((stat) => (
                        <Paper
                            key={stat.label}
                            variant="outlined"
                            sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}
                        >
                            <MsIcon sx={{ color: "primary.main", fontSize: 22 }}>{stat.icon}</MsIcon>
                            <Box>
                                <Typography
                                    sx={{ fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.2 }}
                                >
                                    {stat.value}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {stat.label}
                                </Typography>
                            </Box>
                        </Paper>
                    ))}
                </Box>

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
                    <Button variant="contained" startIcon={<MsIcon>add</MsIcon>} disabled={adding} onClick={handleAdd}>
                        Add programs
                    </Button>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap", rowGap: 1 }}>
                    {CATEGORIES.map((cat) => {
                        const count =
                            cat === "All"
                                ? programs.length
                                : programs.filter((program) => (program.info.category ?? "Uncategorized") === cat)
                                      .length;
                        if (count === 0) {
                            return null;
                        }
                        return (
                            <Chip
                                key={cat}
                                label={`${cat} ${count}`}
                                clickable
                                onClick={() => setCategory(cat)}
                                color={category === cat ? "primary" : "default"}
                                variant={category === cat ? "filled" : "outlined"}
                                sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12.5 }}
                            />
                        );
                    })}
                </Stack>

                {filtered.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
                        <MsIcon sx={{ fontSize: 44, color: "text.secondary" }}>search_off</MsIcon>
                        <Typography variant="h6" sx={{ mt: 1 }}>
                            Nothing on this shelf
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            No program matches your filters.
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
                        {filtered.map((program) => (
                            <ProgramCard
                                key={program.id}
                                program={program}
                                running={runningIds.has(program.id)}
                                summary={summaries[program.id]}
                                actions={actions}
                            />
                        ))}
                    </Box>
                ) : (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small" aria-label="Program list">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Program</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Year</TableCell>
                                    <TableCell>Playtime</TableCell>
                                    <TableCell>Runs</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map((program) => (
                                    <ProgramRow
                                        key={program.id}
                                        program={program}
                                        running={runningIds.has(program.id)}
                                        summary={summaries[program.id]}
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
                        The folder <strong style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{deleting?.dir}</strong>{" "}
                        and its saved states will be removed permanently. This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={confirmDelete}>
                        Delete permanently
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
