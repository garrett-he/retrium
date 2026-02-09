import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

const WEEK = [
    { day: "Mon", minutes: 24 },
    { day: "Tue", minutes: 68 },
    { day: "Wed", minutes: 41 },
    { day: "Thu", minutes: 95 },
    { day: "Fri", minutes: 55 },
    { day: "Sat", minutes: 120 },
    { day: "Sun", minutes: 82 },
];

/** Static weekly playtime bar chart for the detail page. */
export function ActivityBars() {
    const max = Math.max(...WEEK.map((entry) => entry.minutes));
    const total = WEEK.reduce((acc, entry) => acc + entry.minutes, 0);

    return (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Playtime · last 7 days
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 88 }}>
                {WEEK.map((entry) => (
                    <Box
                        key={entry.day}
                        sx={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            height: "100%",
                            justifyContent: "flex-end",
                        }}
                    >
                        <Tooltip title={`${entry.minutes} min`}>
                            <Box
                                sx={{
                                    width: "72%",
                                    height: `${(entry.minutes / max) * 100}%`,
                                    bgcolor: entry.minutes === max ? "primary.main" : "rgba(255,179,0,0.32)",
                                    borderRadius: "4px 4px 0 0",
                                }}
                            />
                        </Tooltip>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, mt: 0.5 }}>
                            {entry.day}
                        </Typography>
                    </Box>
                ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                total {total} min this week
            </Typography>
        </Paper>
    );
}
