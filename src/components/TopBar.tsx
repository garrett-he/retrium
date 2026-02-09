import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { MsIcon } from "@/components/MsIcon";

interface TopBarProps {
    title: string;
    onRefresh: () => void;
}

/** Sticky application top bar with the current section title and refresh action. */
export function TopBar({ title, onRefresh }: TopBarProps) {
    return (
        <AppBar
            position="sticky"
            elevation={0}
            color="transparent"
            sx={{
                bgcolor: "rgba(127,127,127,0.06)",
                backgroundImage: "none",
                borderBottom: "1px solid",
                borderColor: "divider",
                backdropFilter: "blur(8px)",
            }}
        >
            <Toolbar sx={{ gap: 1.5 }}>
                <Typography variant="h6" noWrap component="div" sx={{ mr: "auto" }}>
                    {title}
                </Typography>
                <Tooltip title="Rescan library folder">
                    <IconButton aria-label="Rescan" onClick={onRefresh} sx={{ color: "text.secondary" }}>
                        <MsIcon>refresh</MsIcon>
                    </IconButton>
                </Tooltip>
            </Toolbar>
        </AppBar>
    );
}
