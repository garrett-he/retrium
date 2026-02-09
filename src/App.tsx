import CssBaseline from "@mui/material/CssBaseline";
import ThemeProvider from "@mui/material/styles/ThemeProvider";
import { useMemo } from "react";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { Layout, LoadingScreen, useThemeMode } from "@/components/Layout";
import { ProgramsProvider, useProgramsContext } from "@/hooks/usePrograms";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { LibraryPage } from "@/pages/LibraryPage";
import { ProgramPage } from "@/pages/ProgramPage";
import { RunningPage } from "@/pages/RunningPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { buildTheme } from "@/theme";

function AppContent({
    mode,
    onModeChange,
}: {
    mode: "dark" | "light";
    onModeChange: (mode: "dark" | "light") => void;
}) {
    const { loading, setupState, completeSetup } = useProgramsContext();

    if (loading || !setupState) {
        return <LoadingScreen />;
    }

    if (!setupState.configured) {
        return (
            <SetupPage
                defaults={setupState}
                onComplete={completeSetup}
                onFinished={() => {
                    window.location.hash = "#/";
                }}
            />
        );
    }

    return <RouterProvider router={createAppRouter(mode, onModeChange)} />;
}

function createAppRouter(mode: "dark" | "light", onModeChange: (mode: "dark" | "light") => void) {
    return createHashRouter([
        {
            path: "/",
            element: <Layout mode={mode} onModeChange={onModeChange} />,
            children: [
                { index: true, element: <LibraryPage /> },
                { path: "programs/:id", element: <ProgramPage /> },
                { path: "running", element: <RunningPage /> },
                { path: "settings", element: <SettingsPage mode={mode} onModeChange={onModeChange} /> },
                { path: "*", element: <Navigate to="/" replace /> },
            ],
        },
    ]);
}

export function App() {
    const [mode, setMode] = useThemeMode();
    const theme = useMemo(() => buildTheme(mode), [mode]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <SnackbarProvider>
                <ProgramsProvider>
                    <AppContent mode={mode} onModeChange={setMode} />
                </ProgramsProvider>
            </SnackbarProvider>
        </ThemeProvider>
    );
}
