import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { RunningPage } from "./RunningPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

const processes = [
    {
        pid: 100,
        cart: { id: "doom", dir: "/games/doom", info: { name: "Doom" } },
        dosboxVersion: "DOSBox",
        startedAt: new Date().toISOString(),
    },
];

function mockBackend(running = processes) {
    invoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_setup_state") {
            return { configured: true, library: "/games", dosbox: "/usr/bin/dosbox" };
        }
        if (cmd === "discover_carts") {
            return running.map((process) => process.cart);
        }
        if (cmd === "get_dosbox_versions") {
            return { default: "DOSBox", versions: [{ name: "DOSBox", path: "/usr/bin/dosbox" }] };
        }
        if (cmd === "get_cart_summaries") {
            return {};
        }
        if (cmd === "list_cart_processes") {
            return running;
        }
        if (cmd === "stop_all_carts") {
            return running.length;
        }
        return [];
    });
}

function renderPage() {
    return render(
        <MemoryRouter>
            <SnackbarProvider>
                <CartsProvider>
                    <RunningPage />
                </CartsProvider>
            </SnackbarProvider>
        </MemoryRouter>,
    );
}

describe("RunningPage", () => {
    beforeEach(() => {
        mockBackend();
    });

    it("lists running processes with pid, version and uptime", async () => {
        renderPage();
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(screen.getByText(/pid 100 · DOSBox DOSBox/)).toBeTruthy();
        expect(screen.getByText(/\d+:\d{2}/)).toBeTruthy();
    });

    it("stops a single process", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Doom");

        await user.click(screen.getByRole("button", { name: "Stop" }));

        expect(invoke).toHaveBeenCalledWith("stop_cart", { cart: processes[0].cart });
        expect(await screen.findByText("Doom stopped")).toBeTruthy();
    });

    it("offers stop all only with multiple processes", async () => {
        const user = userEvent.setup();
        mockBackend([
            ...processes,
            {
                pid: 101,
                cart: { id: "wolf", dir: "/games/wolf", info: { name: "Wolfenstein" } },
                dosboxVersion: "Staging",
                startedAt: new Date().toISOString(),
            },
        ]);
        renderPage();

        expect(await screen.findByText("Wolfenstein")).toBeTruthy();
        expect(screen.getByText("2 carts emulated in DOSBox")).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Stop all" }));
        expect(invoke).toHaveBeenCalledWith("stop_all_carts");
        expect(await screen.findByText("Stopped 2 carts")).toBeTruthy();
    });

    it("shows an empty state when nothing runs", async () => {
        const user = userEvent.setup();
        mockBackend([]);
        renderPage();

        expect(await screen.findByText("Nothing is running")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Go to library" }));
        expect(true).toBe(true);
    });
});
