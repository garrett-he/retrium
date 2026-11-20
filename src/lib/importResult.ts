import type { TFunction } from "@/i18n";
import type { ImportReport } from "@/types";

/**
 * True when an import report needs the decision dialog: pending upgrades,
 * conflicts and downgrades require an explicit click, which a toast cannot
 * collect. Everything else is summarised in a toast.
 */
export function needsDecision(report: ImportReport): boolean {
    return report.pending.length > 0;
}

/** One-line summary of an import that needed no decisions. */
export function importResultMessage(report: ImportReport, t: TFunction): string {
    if (report.imported.length === 1 && report.skipped.length === 0) {
        return t("import.toast.imported", { name: report.imported[0].info.name });
    }
    return t("import.toast.report", {
        imported: report.imported.length,
        skipped: report.skipped.length,
    });
}

/** Toast severity for a report without pending decisions. */
export function importResultSeverity(report: ImportReport): "success" | "info" {
    return report.imported.length > 0 ? "success" : "info";
}
