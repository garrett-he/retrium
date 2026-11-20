import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import type { Cart, ExportPreview } from "@/types";

interface ExportDialogProps {
    cart: Cart | null;
    onClose: () => void;
}

/**
 * The only place `cart.revision` can change.
 *
 * The prompt is driven by the same four-row matrix the backend uses to decide
 * what goes into the archive, so "content changed" here means exactly "the next
 * archive would hash differently" — no extra state flag involved.
 */
export function ExportDialog({ cart, onClose }: ExportDialogProps) {
    const { notify } = useSnackbar();
    const { previewExport, commitCart, exportCartFile } = useCartsContext();

    const [preview, setPreview] = useState<ExportPreview | null>(null);
    const [revision, setRevision] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!cart) {
            setPreview(null);
            return;
        }
        let active = true;
        setPreview(null);
        setError(null);
        previewExport(cart.id)
            .then((result) => {
                if (!active) {
                    return;
                }
                setPreview(result);
                setRevision(String(result.nextRevision));
            })
            .catch((err: unknown) => {
                if (active) {
                    setError(String(err));
                }
            });
        return () => {
            active = false;
        };
    }, [cart, previewExport]);

    if (!cart) {
        return null;
    }

    const parsed = Number.parseInt(revision, 10);
    const valid = Number.isInteger(parsed) && parsed >= 1 && (preview === null || parsed >= preview.revision);
    const sameRevision = preview !== null && parsed === preview.revision;

    const confirm = () => {
        setBusy(true);
        setError(null);
        commitCart(cart.id, parsed)
            .then(async (updated) => {
                const path = await exportCartFile(updated.id);
                notify(path ? `Exported ${updated.info.name}.cart` : "Archive rebuilt", "success");
                onClose();
            })
            .catch((err: unknown) => setError(String(err)))
            .finally(() => setBusy(false));
    };

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={busy ? undefined : onClose}>
            <DialogTitle>Export “{cart.info.name}”</DialogTitle>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
                {preview === null && error === null && (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}

                {preview !== null && (
                    <>
                        <Typography variant="body2" color="text.secondary">
                            {preview.dirty
                                ? "The installed copy differs from the archive on disk. Everything you added or replaced goes into the new package; save files written during a run stay on this machine."
                                : "The archive on disk already matches the installed copy. You can still repackage it under a new revision."}
                        </Typography>
                        <TextField
                            label="Revision"
                            type="number"
                            size="small"
                            value={revision}
                            onChange={(event) => setRevision(event.target.value)}
                            error={!valid}
                            helperText={
                                valid
                                    ? `Current revision is ${preview.revision}. This prompt is the only place it changes.`
                                    : `Revision must be ${preview.revision} or higher.`
                            }
                            inputProps={{ min: preview.revision, step: 1 }}
                            sx={{ width: 200 }}
                        />
                        {preview.dirty && sameRevision && (
                            <Alert severity="warning">
                                Exporting now gives this revision two different contents. Anyone importing both will hit
                                a revision conflict.
                            </Alert>
                        )}
                        {!preview.dirty && !sameRevision && (
                            <Alert severity="info">
                                Content is unchanged; only the revision number moves, so the package hashes one revision
                                further without any content difference.
                            </Alert>
                        )}
                        <Stack spacing={0.5}>
                            <Typography variant="caption" color="text.secondary">
                                Archive hash
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ fontFamily: '"IBM Plex Mono", monospace', wordBreak: "break-all" }}
                            >
                                {preview.packageHash || "—"}
                            </Typography>
                        </Stack>
                    </>
                )}

                {error !== null && (
                    <Typography role="alert" variant="body2" color="error">
                        {error}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={confirm} disabled={busy || preview === null || !valid}>
                    {busy ? "Exporting…" : "Export cart…"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
