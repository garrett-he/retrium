import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { createContext, createElement, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface Snack {
    key: number;
    message: string;
    severity: "success" | "info" | "warning" | "error";
}

interface SnackbarContextValue {
    notify: (message: string, severity?: Snack["severity"]) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
    const [snack, setSnack] = useState<Snack | null>(null);

    const notify = useCallback((message: string, severity: Snack["severity"] = "info") => {
        setSnack({ key: Date.now(), message, severity });
    }, []);

    const value = useMemo(() => ({ notify }), [notify]);

    return createElement(
        SnackbarContext.Provider,
        { value },
        children,
        <Snackbar
            key={snack?.key}
            open={snack !== null}
            autoHideDuration={3200}
            onClose={() => setSnack(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
            {snack ? (
                <Alert
                    onClose={() => setSnack(null)}
                    severity={snack.severity}
                    variant="filled"
                    sx={{ borderRadius: "8px" }}
                >
                    {snack.message}
                </Alert>
            ) : undefined}
        </Snackbar>,
    );
}

export function useSnackbar(): SnackbarContextValue {
    const ctx = useContext(SnackbarContext);
    if (!ctx) {
        throw new Error("useSnackbar must be used within a SnackbarProvider");
    }
    return ctx;
}
