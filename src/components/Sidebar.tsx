import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useLocation, useNavigate } from "react-router-dom";
import { MsIcon } from "@/components/MsIcon";
import type { ThemeMode } from "@/theme";

export const SIDEBAR_WIDTH = 232;

interface SidebarProps {
    runningCount: number;
    mode: ThemeMode;
    onModeChange: (mode: ThemeMode) => void;
}

/** Persistent navigation drawer with the Retrium brand and theme switch. */
export function Sidebar({ runningCount, mode, onModeChange }: SidebarProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const items = [
        { key: "/", label: "Library", icon: "grid_view" },
        { key: "/running", label: "Running", icon: "play_circle", badge: runningCount },
        { key: "/settings", label: "Settings", icon: "settings" },
    ];

    return (
        <Drawer
            sx={{
                width: SIDEBAR_WIDTH,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                    width: SIDEBAR_WIDTH,
                    boxSizing: "border-box",
                    borderRight: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    display: "flex",
                    flexDirection: "column",
                },
            }}
            variant="permanent"
            anchor="left"
        >
            <Box sx={{ px: 2.5, py: 2.2, display: "flex", alignItems: "center", gap: 1.5 }}>
                <MsIcon filled sx={{ color: "primary.main", fontSize: 26 }}>
                    terminal
                </MsIcon>
                <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, letterSpacing: "0.22em" }}>
                    RETRIUM
                </Typography>
            </Box>
            <List sx={{ px: 1.5, flexGrow: 1 }}>
                {items.map((item) => {
                    const selected = pathname === item.key || (item.key === "/" && pathname.startsWith("/programs"));
                    return (
                        <ListItemButton
                            key={item.key}
                            onClick={() => navigate(item.key)}
                            selected={selected}
                            sx={{ borderRadius: "10px", mb: 0.5, py: 1.1 }}
                        >
                            <ListItemIcon sx={{ minWidth: 40, color: selected ? "primary.main" : "text.secondary" }}>
                                {item.badge ? (
                                    <Badge badgeContent={item.badge} color="success">
                                        <MsIcon>{item.icon}</MsIcon>
                                    </Badge>
                                ) : (
                                    <MsIcon>{item.icon}</MsIcon>
                                )}
                            </ListItemIcon>
                            <ListItemText
                                primary={item.label}
                                primaryTypographyProps={{ fontWeight: selected ? 600 : 400 }}
                            />
                        </ListItemButton>
                    );
                })}
            </List>
            <Box sx={{ px: 2.5, pb: 2.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
                    <MsIcon sx={{ fontSize: 18 }}>dark_mode</MsIcon>
                    <Switch
                        size="small"
                        inputProps={{ "aria-label": "Toggle light theme" }}
                        checked={mode === "light"}
                        onChange={(event) => onModeChange(event.target.checked ? "light" : "dark")}
                    />
                    <MsIcon sx={{ fontSize: 18 }}>light_mode</MsIcon>
                </Box>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: "block", fontFamily: '"IBM Plex Mono", monospace' }}
                >
                    v0.2.0 · GPL-3.0
                </Typography>
            </Box>
        </Drawer>
    );
}
