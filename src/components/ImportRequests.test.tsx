import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doom, makeBackend } from "@/__mocks__/backend";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { I18nProvider } from "@/i18n";
import type { ImportReport } from "@/types";
import { ImportRequests } from "./ImportRequests";

const { invoke, listen } = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

const report: ImportReport = {
    imported: [doom],
    skipped: [],
    pending: [],
};

/** Every `listen` subscriber is kept so a test can play the `pending-imports` event. */
let notifyListeners: (() => void)[] = [];

function renderComponent(backend = makeBackend()) {
    invoke.mockImplementation(backend);
    return render(
        <I18nProvider>
            <SnackbarProvider>
                <CartsProvider>
                    <ImportRequests />
                </CartsProvider>
            </SnackbarProvider>
        </I18nProvider>,
    );
}

describe("ImportRequests", () => {
    beforeEach(() => {
        invoke.mockReset();
        notifyListeners = [];
        listen.mockReset();
        listen.mockImplementation((_event: string, handler: () => void) => {
            notifyListeners.push(handler);
            return Promise.resolve(() => undefined);
        });
    });

    it("drains the queue on mount and stays silent when nothing is pending", async () => {
        renderComponent();
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("take_pending_imports"));
        expect(screen.queryByText("Import results")).toBeNull();
    });

    it("imports the paths queued at startup and shows the report", async () => {
        renderComponent(
            makeBackend({
                pendingImports: ["C:/carts/doom.cart"],
                handlers: { import_carts: () => report },
            }),
        );
        expect(await screen.findByText("Import results")).toBeTruthy();
        expect(screen.getByText("Doom · revision 3")).toBeTruthy();
    });

    it("imports again when a second instance hands over paths", async () => {
        // The queue is empty at mount and filled only when the event fires,
        // so the dialog can only come from the `pending-imports` path.
        let queue: string[] = [];
        renderComponent(
            makeBackend({
                handlers: {
                    take_pending_imports: () => queue,
                    import_carts: () => report,
                },
            }),
        );
        // Let the mount-time drain finish before the event arrives.
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("take_pending_imports"));

        queue = ["C:/carts/doom.cart"];
        for (const handler of notifyListeners) {
            handler();
        }
        expect(await screen.findByText("Import results")).toBeTruthy();
    });
});
