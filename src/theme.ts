import { createTheme } from "@mui/material/styles";

export type ThemeMode = "dark" | "light";

export function buildTheme(mode: ThemeMode) {
    const dark = mode === "dark";
    return createTheme({
        palette: {
            mode,
            primary: { main: dark ? "#FFB300" : "#9A6100", contrastText: dark ? "#241A05" : "#FFFFFF" },
            secondary: { main: dark ? "#8FBFAF" : "#3E7264", contrastText: dark ? "#10201B" : "#FFFFFF" },
            success: { main: dark ? "#66BB6A" : "#2E7D32" },
            error: { main: dark ? "#E57368" : "#C62828" },
            background: dark ? { default: "#171412", paper: "#1F1B17" } : { default: "#F0E8D9", paper: "#FBF6EC" },
            text: dark ? { primary: "#ECE5DA", secondary: "#A89C8C" } : { primary: "#2B241A", secondary: "#6E6353" },
            divider: dark ? "rgba(236,229,218,0.12)" : "rgba(43,36,26,0.16)",
        },
        shape: { borderRadius: 12 },
        typography: {
            fontFamily: '"IBM Plex Sans", sans-serif',
            h4: { fontWeight: 700, letterSpacing: "-0.01em" },
            h5: { fontWeight: 700 },
            h6: { fontWeight: 600 },
            button: { fontWeight: 600, textTransform: "none" },
        },
        components: {
            MuiButton: { styleOverrides: { root: { borderRadius: "10px", paddingInline: 18 } } },
            MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
            MuiCard: {
                styleOverrides: {
                    root: {
                        backgroundImage: "none",
                        border: "1px solid rgba(128,114,96,0.25)",
                        transition: "transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s cubic-bezier(.16,1,.3,1)",
                    },
                },
            },
        },
    });
}

export const MONO_FONT = '"IBM Plex Mono", monospace';
