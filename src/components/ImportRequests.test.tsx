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

const plain: ImportReport = {
    imported: [doom],
    skipped: [],
    pending: [],
};

const conflicting: ImportReport = {
    imported: [],
    skipped: [],
    pending: [
        {
            archive: "/carts/doom-v3.cart",
            id: doom.id,
            name: "Doom",
            decision: "conflict",
            message: "same revision, different content",
            existingRevision: 3,
            incomingRevision: 3,
        },
    ],
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

    it("summarises a plain import in a toast instead of a dialog", async () => {
        renderComponent(
            makeBackend({
                pendingImports: ["C:/carts/doom.cart"],
                handlers: { import_carts: () => plain },
            }),
        );
        expect(await screen.findByText("Doom imported")).toBeTruthy();
        expect(screen.queryByText("Import results")).toBeNull();
    });

    it("opens the decision dialog when a report has pending items", async () => {
        renderComponent(
            makeBackend({
                pendingImports: ["C:/carts/doom-v3.cart"],
                handlers: { import_carts: () => conflicting },
            }),
        );
        expect(await screen.findByText("Import results")).toBeTruthy();
        expect(screen.getByText("Replace local")).toBeTruthy();
    });

    it("imports again when a second instance hands over paths", async () => {
        // The queue is empty at mount and filled only when the event fires,
        // so the toast can only come from the `pending-imports` path.
        let queue: string[] = [];
        renderComponent(
            makeBackend({
                handlers: {
                    take_pending_imports: () => queue,
                    import_carts: () => plain,
                },
            }),
        );
        // Let the mount-time drain finish before the event arrives.
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("take_pending_imports"));

        queue = ["C:/carts/doom.cart"];
        for (const handler of notifyListeners) {
            handler();
        }
        expect(await screen.findByText("Doom imported")).toBeTruthy();
    });
});
