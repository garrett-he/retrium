import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
    configured: true,
    loading: false,
    invoke: vi.fn(async (cmd: string) => {
        if (cmd === "get_setup_state") {
            if (mocks.loading) {
                return new Promise(() => undefined);
            }
            return { configured: mocks.configured, library: "/games", dosbox: "/usr/bin/dosbox" };
        }
        if (cmd === "discover_programs") {
            return [{ id: "doom", dir: "/games/doom", info: { name: "Doom", category: "Action" } }];
        }
        if (cmd === "get_dosbox_versions") {
            return { default: "DOSBox", versions: [{ name: "DOSBox", path: "/usr/bin/dosbox" }] };
        }
        if (cmd === "get_program_summaries") {
            return { doom: { lastRun: "2026-01-01T00:00:00Z", runs: 2, elapsed: 3600 } };
        }
        return [];
    }),
}));

vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: vi.fn((path: string) => path),
    invoke: mocks.invoke,
}));

describe("App", () => {
    afterEach(() => {
        mocks.configured = true;
        mocks.loading = false;
    });

    it("renders the library page after loading", async () => {
        render(<App />);
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(screen.getAllByText("Library").length).toBeGreaterThan(0);
    });

    it("renders the setup wizard on first run", async () => {
        mocks.configured = false;
        render(<App />);
        expect(await screen.findByText("Welcome to Retrium")).toBeTruthy();
        expect(screen.queryByText("Library")).toBeNull();
    });

    it("renders a loading screen while the setup state is unknown", async () => {
        mocks.loading = true;
        render(<App />);
        const marks = await screen.findAllByText("RETRIUM");
        expect(marks.length).toBeGreaterThan(0);
        expect(screen.queryByText("Doom")).toBeNull();
    });

    it("toggles the theme and refreshes the library from the top bar", async () => {
        const user = userEvent.setup();
        render(<App />);
        await screen.findByText("Doom");

        await user.click(screen.getByLabelText("Toggle light theme"));
        expect(localStorage.getItem("retrium-theme")).toBe("light");

        mocks.invoke.mockClear();
        await user.click(screen.getByLabelText("Rescan"));
        expect(mocks.invoke).toHaveBeenCalledWith("discover_programs");
    });
});
