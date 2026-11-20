import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { ImportReportDialog } from "@/components/ImportReportDialog";
import { useCartsContext } from "@/hooks/useCarts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { api } from "@/lib/api";
import type { ImportReport } from "@/types";

/**
 * Picks up carts handed to the app from outside the UI: double-clicked `.cart`
 * files, queued by the backend at startup or by a second instance.
 *
 * The queue is drained once on mount (catching paths that arrived before this
 * component existed) and then on every `pending-imports` event. The report
 * dialog is the same one the manual import flow shows, so pending upgrades,
 * conflicts and downgrades keep their explicit-decision behaviour.
 */
export function ImportRequests() {
    const { importCarts } = useCartsContext();
    const { notify } = useSnackbar();
    const [report, setReport] = useState<ImportReport | null>(null);
    const draining = useRef(false);

    useEffect(() => {
        let cancelled = false;

        const drain = async () => {
            if (draining.current) {
                return;
            }
            draining.current = true;
            try {
                const paths = await api.takePendingImports();
                if (paths.length === 0 || cancelled) {
                    return;
                }
                const result = await importCarts(paths);
                if (!cancelled) {
                    setReport(result);
                }
            } catch (error) {
                if (!cancelled) {
                    notify(String(error), "error");
                }
            } finally {
                draining.current = false;
            }
        };

        void drain();
        const subscription = listen("pending-imports", () => void drain());
        return () => {
            cancelled = true;
            void subscription.then((unlisten) => unlisten());
        };
    }, [importCarts, notify]);

    if (!report) {
        return null;
    }
    return <ImportReportDialog report={report} onClose={() => setReport(null)} />;
}
