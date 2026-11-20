import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { civilization, doom, makeBackend, processFor, wolfenstein } from "@/__mocks__/backend";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { I18nProvider } from "@/i18n";
import type { CartProcess } from "@/types";
import { RunningPage } from "./RunningPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

function renderPage() {
    return render(
        <I18nProvider>
            <MemoryRouter>
                <SnackbarProvider>
                    <CartsProvider>
                        <RunningPage />
                    </CartsProvider>
                </SnackbarProvider>
            </MemoryRouter>
        </I18nProvider>,
    );
}

describe("RunningPage", () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(makeBackend({ processes: [processFor(doom, "setup", "Sound setup")] }));
    });

    it("lists a running cart with pid, target label and uptime", async () => {
        renderPage();
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(screen.getByText("pid 4242 · Sound setup")).toBeTruthy();
        expect(screen.getByText(/\d+:\d{2}/)).toBeTruthy();
    });

    it("stops a single process by cart id", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Stop" }));

        expect(invoke).toHaveBeenCalledWith("stop_cart", { id: doom.id });
        expect(await screen.findByText("Doom stopped")).toBeTruthy();
    });

    it("offers stop all only with multiple processes", async () => {
        const processes: CartProcess[] = [processFor(doom), processFor(civilization, "play", "Main game")];
        invoke.mockImplementation(makeBackend({ processes, handlers: { stop_all_carts: () => 2 } }));
        const user = userEvent.setup();
        renderPage();

        expect(await screen.findByText("Civilization")).toBeTruthy();
        expect(screen.getByText("2 carts emulated in DOSBox")).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Stop all" }));
        expect(invoke).toHaveBeenCalledWith("stop_all_carts");
        expect(await screen.findByText("Stopped 2 carts")).toBeTruthy();
    });

    it("falls back to the cart id when the cart is not in the library yet", async () => {
        invoke.mockImplementation(
            makeBackend({ carts: [wolfenstein], processes: [processFor(doom, "play", "Main game")] }),
        );
        renderPage();

        expect(await screen.findByText(doom.id)).toBeTruthy();
    });

    it("shows an empty state when nothing runs", async () => {
        const user = userEvent.setup();
        invoke.mockImplementation(makeBackend({ processes: [] }));
        renderPage();

        expect(await screen.findByText("Nothing is running")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Go to library" }));
        expect(screen.queryByText("Doom")).toBeNull();
    });
});
