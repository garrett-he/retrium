import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { CoverArt } from "@/components/CoverArt";
import { type ProgramMenuActions, ProgramMenuButton } from "@/components/ProgramMenu";
import { RunningChip } from "@/components/RunningChip";
import { formatPlaytime } from "@/lib/format";
import type { Program, ProgramSummary } from "@/types";

interface ProgramRowProps {
    program: Program;
    running: boolean;
    summary?: ProgramSummary;
    actions: ProgramMenuActions;
}

/** Compact table row used by the list view of the library. */
export function ProgramRow({ program, running, summary, actions }: ProgramRowProps) {
    const navigate = useNavigate();

    return (
        <TableRow hover onClick={() => navigate(`/programs/${program.id}`)} sx={{ cursor: "pointer" }}>
            <TableCell>
                <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 12 }}>
                    <CoverArt program={program} height={40} glyphSize={20} radius="6px" thumbnail />
                </span>
                <Typography component="span" sx={{ fontWeight: 600 }}>
                    {program.info.name}
                </Typography>
            </TableCell>
            <TableCell>{program.info.category ?? "Uncategorized"}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>{program.info.release ?? "—"}</TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {summary ? formatPlaytime(summary.elapsed) : "—"}
            </TableCell>
            <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {summary ? `${summary.runs}×` : "—"}
            </TableCell>
            <TableCell>{running ? <RunningChip small /> : "—"}</TableCell>
            <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                <ProgramMenuButton program={program} running={running} actions={actions} />
            </TableCell>
        </TableRow>
    );
}
