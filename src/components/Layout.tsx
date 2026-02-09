import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MsIcon } from "@/components/MsIcon";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { useProgramsContext } from "@/hooks/usePrograms";
import type { ThemeMode } from "@/theme";

const TITLES: Record<string, string> = {
    "/": "Library",
    "/running": "Running",
    "/settings": "Settings",
};

/** App shell with sidebar, contextual top bar and routed content. */
export function Layout({ mode, onModeChange }: { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void }) {
    const { processes, refresh } = useProgramsContext();
    const { pathname } = useLocation();
    const programDetail = pathname.startsWith("/programs/");

    const title = programDetail ? "Program" : (TITLES[pathname] ?? "Library");

    return (
        <Box sx={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar runningCount={processes.length} mode={mode} onModeChange={onModeChange} />
            <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
                <TopBar
                    title={title}
                    onRefresh={() => {
                        refresh().catch(() => undefined);
                    }}
                />
                <Outlet />
            </Box>
        </Box>
    );
}

export function LoadingScreen() {
    return (
        <Stack sx={{ minHeight: "100vh" }} alignItems="center" justifyContent="center" spacing={2}>
            <CircularProgress color="primary" />
            <Stack direction="row" spacing={1.5} alignItems="center">
                <MsIcon filled sx={{ color: "primary.main", fontSize: 24 }}>
                    terminal
                </MsIcon>
                <Typography color="text.secondary" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                    RETRIUM
                </Typography>
            </Stack>
        </Stack>
    );
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
    const [mode, setMode] = useState<ThemeMode>(() => {
        const stored = localStorage.getItem("retrium-theme");
        return stored === "light" ? "light" : "dark";
    });

    const update = (next: ThemeMode) => {
        setMode(next);
        localStorage.setItem("retrium-theme", next);
    };

    return [mode, update];
}
