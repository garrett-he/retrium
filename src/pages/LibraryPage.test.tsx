import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { LibraryPage } from "./LibraryPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

const carts = [
    {
        id: "doom",
        dir: "/games/doom",
        cover: "/games/doom/.retrium/cover.png",
        info: { name: "Doom", category: "Action", release: 1993, tags: ["FPS"] },
    },
    { id: "wolf", dir: "/games/wolf", info: { name: "Wolfenstein", category: "Action", release: 1992 } },
    { id: "civ", dir: "/games/civ", info: { name: "Civilization", category: "Strategy", release: 1991 } },
];

function mockResponse(cmd: string) {
    if (cmd === "get_setup_state") {
        return { configured: true, library: "/games", dosbox: "/usr/bin/dosbox" };
    }
    if (cmd === "discover_carts") {
        return carts;
    }
    if (cmd === "get_dosbox_versions") {
        return { default: "DOSBox", versions: [{ name: "DOSBox", path: "/usr/bin/dosbox" }] };
    }
    if (cmd === "get_cart_summaries") {
        return { doom: { lastRun: "2026-01-02T00:00:00Z", runs: 3, elapsed: 5400 } };
    }
    if (cmd === "list_cart_processes") {
        return [];
    }
    if (cmd === "add_carts") {
        return [{ id: "keen", dir: "/games/keen", info: { name: "Keen" } }];
    }
    return [];
}

function mockBackend() {
    invoke.mockImplementation(async (cmd: string) => mockResponse(cmd));
}

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
        mockBackend();
    });

    it("renders discovered carts without the stats overview", async () => {
        renderPage();
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(screen.getByText("Wolfenstein")).toBeTruthy();
        expect(screen.getByText("1h 30m")).toBeTruthy();
        expect(screen.queryByText("Total playtime")).toBeNull();
        expect(screen.queryByText("Running now")).toBeNull();
        expect(screen.queryByText("Categories")).toBeNull();
    });

    it("filters carts by category from the dropdown", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("combobox", { name: "Category" }));
        await user.click(await screen.findByRole("option", { name: "Strategy" }));

        expect(screen.queryByText("Doom")).toBeNull();
        expect(screen.getByText("Civilization")).toBeTruthy();

        await user.click(screen.getByRole("combobox", { name: "Category" }));
        await user.click(await screen.findByRole("option", { name: "All" }));

        expect(await screen.findByText("Doom")).toBeTruthy();
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

    it("switches between grid and list views", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Toggle view" }));
        expect(screen.getByText("Cart")).toBeTruthy();
        expect(screen.getByText("Playtime")).toBeTruthy();
    });

    it("adds carts from the library folder and reports the result", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Add carts" }));

        expect(await screen.findByText("1 new carts added")).toBeTruthy();
        expect(invoke).toHaveBeenCalledWith("add_carts");
    });

    it("deletes a cart through the confirmation dialog", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Delete"));

        expect(screen.getByText(/will be removed permanently/)).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Delete permanently" }));

        expect(invoke).toHaveBeenCalledWith("delete_cart", expect.objectContaining({ cart: expect.anything() }));
        expect(await screen.findByText("Doom deleted")).toBeTruthy();
    });

    it("runs, opens the folder and exports from the card menu", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Run with default DOSBox"));
        expect(invoke).toHaveBeenCalledWith(
            "run_cart",
            expect.objectContaining({ options: expect.objectContaining({ dosboxVersion: "DOSBox" }) }),
        );
        expect(await screen.findByText("Launched Doom in DOSBox")).toBeTruthy();

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Open folder"));
        expect(invoke).toHaveBeenCalledWith("open_cart_folder", expect.anything());
        expect(await screen.findByText("Opened /games/doom")).toBeTruthy();

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Export cart"));
        expect(invoke).toHaveBeenCalledWith("archive_cart", expect.anything());
        expect(await screen.findByText("Exported Doom.cart")).toBeTruthy();
    });

    it("stops a running cart from the card menu", async () => {
        invoke.mockImplementation(async (cmd: string) => {
            if (cmd === "list_cart_processes") {
                return [
                    {
                        pid: 7,
                        cart: carts[0],
                        dosboxVersion: "DOSBox",
                        startedAt: new Date().toISOString(),
                    },
                ];
            }
            return mockResponse(cmd);
        });

        const user = userEvent.setup();
        renderPage();
        expect(await screen.findByText("Running")).toBeTruthy();

        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        await user.click(screen.getByText("Stop"));

        expect(invoke).toHaveBeenCalledWith("stop_cart", expect.anything());
        expect(await screen.findByText("Doom stopped")).toBeTruthy();
    });

    it("renders the cover image when a cart provides one", async () => {
        renderPage();
        const cover = await screen.findByTestId("cover-doom");
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
        await user.click(screen.getAllByText("Wolfenstein")[0]);
        expect(await screen.findByText("detail view")).toBeTruthy();
    });

    it("opens the row menu in list view without navigating", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Toggle view" }));
        await user.click(screen.getAllByLabelText("Cart menu")[0]);
        expect(await screen.findByText("Run with default DOSBox")).toBeTruthy();
        expect(screen.queryByText("detail view")).toBeNull();
    });
});
