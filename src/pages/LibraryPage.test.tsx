import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { civilization, doom, makeBackend, processFor, wolfenstein } from "@/__mocks__/backend";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import type { ImportReport } from "@/types";
import { LibraryPage } from "./LibraryPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

const report: ImportReport = {
    imported: [doom],
    skipped: [{ archive: "/carts/broken.cart", id: "", reason: "Not a Retrium cart" }],
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

function renderPage() {
    return render(
        <MemoryRouter>
            <SnackbarProvider>
                <CartsProvider>
                    <Routes>
                        <Route path="/" element={<LibraryPage />} />
                        <Route path="/carts/:id" element={<div>detail view</div>} />
                    </Routes>
                </CartsProvider>
            </SnackbarProvider>
        </MemoryRouter>,
    );
}

describe("LibraryPage", () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(makeBackend());
    });

    it("renders discovered carts with their playtime", async () => {
        renderPage();
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(screen.getByText("Wolfenstein 3D")).toBeTruthy();
        expect(screen.getByText("1h 30m")).toBeTruthy();
        expect(screen.queryByText("Total playtime")).toBeNull();
    });

    it("marks carts with unexported changes", async () => {
        renderPage();
        await screen.findByText("Doom");
        expect(screen.getByTestId(`dirty-${doom.id}`)).toBeTruthy();
    });

    it("filters carts by category from the dropdown", async () => {
        invoke.mockImplementation(
            makeBackend({ carts: [doom, { ...wolfenstein, info: { ...wolfenstein.info, category: "demo" } }] }),
        );
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("combobox", { name: "Category" }));
        await user.click(await screen.findByRole("option", { name: "demo" }));

        expect(screen.queryByText("Doom")).toBeNull();
        expect(screen.getByText("Wolfenstein 3D")).toBeTruthy();
    });

    it("filters by search and offers a clear action", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.type(screen.getByPlaceholderText("Search by name, developer or tag…"), "zzz");
        expect(await screen.findByText("Nothing on this shelf")).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(await screen.findByText("Doom")).toBeTruthy();
    });

    it("shows the revision column in list view", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Toggle view" }));
        expect(screen.getByText("Revision")).toBeTruthy();
        expect(screen.getByText("r3")).toBeTruthy();
    });

    it("imports carts and reports the result", async () => {
        invoke.mockImplementation(makeBackend({ importReport: report }));
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Add carts" }));

        expect(invoke).toHaveBeenCalledWith("add_carts");
        expect(await screen.findByText("1 imported")).toBeTruthy();
        expect(screen.getByText("Not a Retrium cart")).toBeTruthy();
        expect(screen.getByText("same revision, different content")).toBeTruthy();
    });

    it("never applies a conflicting import on its own", async () => {
        invoke.mockImplementation(makeBackend({ importReport: report }));
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Add carts" }));
        await screen.findByText("1 imported");

        expect(invoke).not.toHaveBeenCalledWith("resolve_import", expect.anything());

        await user.click(screen.getByRole("button", { name: "Replace local" }));
        expect(invoke).toHaveBeenCalledWith("resolve_import", { archive: "/carts/doom-v3.cart", action: "apply" });
        expect(await screen.findByText("Doom imported")).toBeTruthy();
    });

    it("skips a pending import without touching the backend", async () => {
        invoke.mockImplementation(makeBackend({ importReport: report }));
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Add carts" }));
        await screen.findByText("1 imported");

        await user.click(screen.getByRole("button", { name: "Skip" }));
        expect(screen.queryByText("Replace local")).toBeNull();
        expect(invoke).not.toHaveBeenCalledWith("resolve_import", expect.anything());
    });

    it("deletes a cart through the confirmation dialog", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Delete"));
        expect(screen.getByText(/will be removed/)).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Delete permanently" }));
        expect(invoke).toHaveBeenCalledWith("delete_cart", { id: doom.id });
        expect(await screen.findByText("Doom deleted")).toBeTruthy();
    });

    it("runs the default target and lists the other targets from the card menu", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        expect(await screen.findByText("Run with…")).toBeTruthy();
        expect(screen.getByText("Sound setup")).toBeTruthy();

        await user.click(screen.getByText("Run"));
        expect(invoke).toHaveBeenCalledWith("run_cart", { id: doom.id, targetId: undefined });
        expect(await screen.findByText("Launched Doom · Main game")).toBeTruthy();
    });

    it("runs a specific target from the card menu", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(await screen.findByText("Sound setup"));

        expect(invoke).toHaveBeenCalledWith("run_cart", { id: doom.id, targetId: "setup" });
    });

    it("opens the folder and exports from the card menu", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Open folder"));
        expect(invoke).toHaveBeenCalledWith("open_cart_folder", { id: doom.id });

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Export cart…"));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Export cart…" }));
        expect(invoke).toHaveBeenCalledWith("commit_cart", { id: doom.id, revision: 4 });
    });

    it("stops a running cart from the card menu", async () => {
        invoke.mockImplementation(makeBackend({ processes: [processFor(civilization)] }));
        const user = userEvent.setup();
        renderPage();
        expect(await screen.findByText("Running")).toBeTruthy();

        const menus = screen.getAllByLabelText("Cart menu");
        await user.click(menus[2]);
        await user.click(await screen.findByText("Stop"));

        expect(invoke).toHaveBeenCalledWith("stop_cart", { id: civilization.id });
        expect(await screen.findByText("Civilization stopped")).toBeTruthy();
    });

    it("renders the cover image when a cart provides one", async () => {
        invoke.mockImplementation(
            makeBackend({ carts: [{ ...doom, cover: "/games/installed/doom/Resources/cover.png" }] }),
        );
        renderPage();
        const cover = await screen.findByTestId(`cover-${doom.id}`);
        expect(cover.querySelector("img")).toBeTruthy();
    });

    it("navigates to the detail page from a card", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByText("Doom"));
        expect(await screen.findByText("detail view")).toBeTruthy();
    });

    it("navigates to the detail page from a list row", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Toggle view" }));
        await user.click(screen.getAllByText("Wolfenstein 3D")[0]);
        expect(await screen.findByText("detail view")).toBeTruthy();
    });

    it("opens the row menu in list view without navigating", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Toggle view" }));
        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        expect(await screen.findByText("Run")).toBeTruthy();
        expect(screen.queryByText("detail view")).toBeNull();
    });

    it("invites an import when the library is empty", async () => {
        invoke.mockImplementation(makeBackend({ carts: [] }));
        renderPage();

        expect(await screen.findByText("The shelf is empty")).toBeTruthy();
        expect(screen.getByText("Import a .cart file to put something on it.")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Import .cart" })).toBeTruthy();
    });
});
