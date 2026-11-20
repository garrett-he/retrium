import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { type StringKey, useT } from "@/i18n";

const WEEK: Array<{ day: StringKey; minutes: number }> = [
    { day: "activity.day.mon", minutes: 24 },
    { day: "activity.day.tue", minutes: 68 },
    { day: "activity.day.wed", minutes: 41 },
    { day: "activity.day.thu", minutes: 95 },
    { day: "activity.day.fri", minutes: 55 },
    { day: "activity.day.sat", minutes: 120 },
    { day: "activity.day.sun", minutes: 82 },
];

/** Static weekly playtime bar chart for the detail page. */
export function ActivityBars() {
    const t = useT();
    const max = Math.max(...WEEK.map((entry) => entry.minutes));
    const total = WEEK.reduce((acc, entry) => acc + entry.minutes, 0);

    return (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                {t("activity.title")}
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
                        <Tooltip title={t("activity.minutes", { count: entry.minutes })}>
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
                            {t(entry.day)}
                        </Typography>
                    </Box>
                ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                {t("activity.total", { count: total })}
            </Typography>
        </Paper>
    );
}
