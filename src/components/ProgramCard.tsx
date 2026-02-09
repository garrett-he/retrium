import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { CoverArt } from "@/components/CoverArt";
import { MsIcon } from "@/components/MsIcon";
import { type ProgramMenuActions, ProgramMenuButton } from "@/components/ProgramMenu";
import { RunningChip } from "@/components/RunningChip";
import { formatPlaytime } from "@/lib/format";
import type { Program, ProgramSummary } from "@/types";

interface ProgramCardProps {
    program: Program;
    running: boolean;
    summary?: ProgramSummary;
    actions: ProgramMenuActions;
}

/** Grid card showing cover art, quick metadata and a kebab menu. */
export function ProgramCard({ program, running, summary, actions }: ProgramCardProps) {
    const navigate = useNavigate();

    return (
        <Card
            sx={{
                position: "relative",
                "&:hover": { transform: "translateY(-4px)", boxShadow: "0 14px 30px -12px rgba(0,0,0,.5)" },
            }}
        >
            <CardActionArea onClick={() => navigate(`/programs/${program.id}`)} sx={{ height: "100%" }}>
                <Box sx={{ position: "relative" }}>
                    <CoverArt program={program} height={132} glyphSize={54} />
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
                        {program.info.name}
                    </Typography>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
                    >
                        {program.info.release ?? "—"} · {program.info.category ?? "Uncategorized"}
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                            <MsIcon sx={{ fontSize: 15 }}>schedule</MsIcon>
                            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                {summary ? formatPlaytime(summary.elapsed) : "—"}
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                            <MsIcon sx={{ fontSize: 15 }}>replay</MsIcon>
                            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                {summary ? `${summary.runs}×` : "—"}
                            </Typography>
                        </Stack>
                    </Stack>
                </Box>
            </CardActionArea>
            <ProgramMenuButton
                program={program}
                running={running}
                actions={actions}
                sx={{ position: "absolute", top: 6, right: 6, color: "#fff", bgcolor: "rgba(23,20,18,0.55)" }}
            />
        </Card>
    );
}
