import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBackend } from "@/__mocks__/backend";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
    configured: true,
    loading: false,
    invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: vi.fn((path: string) => path),
    invoke: mocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(async () => () => undefined),
}));

const backend = makeBackend();

describe("App", () => {
    afterEach(() => {
        mocks.configured = true;
        mocks.loading = false;
        mocks.invoke.mockReset();
    });

    function install() {
        mocks.invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
            if (command === "get_setup_state" && mocks.loading) {
                return new Promise(() => undefined);
            }
            if (command === "get_setup_state") {
                return { configured: mocks.configured, library: "/games", dosbox: "/usr/bin/dosbox" };
            }
            return backend(command, args);
        });
    }

    it("renders the library page after loading", async () => {
        install();
        render(<App />);
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(screen.getAllByText("Library").length).toBeGreaterThan(0);
    });

    it("renders the setup wizard on first run", async () => {
        mocks.configured = false;
        install();
        render(<App />);
        expect(await screen.findByText("Welcome to Retrium")).toBeTruthy();
        expect(screen.queryByText("Library")).toBeNull();
    });

    it("renders a loading screen while the setup state is unknown", async () => {
        mocks.loading = true;
        install();
        render(<App />);
        const marks = await screen.findAllByText("RETRIUM");
        expect(marks.length).toBeGreaterThan(0);
        expect(screen.queryByText("Doom")).toBeNull();
    });

    it("toggles the theme and rescans the library from the top bar", async () => {
        install();
        const user = userEvent.setup();
        render(<App />);
        await screen.findByText("Doom");

        await user.click(screen.getByLabelText("Toggle light theme"));
        expect(localStorage.getItem("retrium-theme")).toBe("light");

        mocks.invoke.mockClear();
        await user.click(screen.getByLabelText("Rescan"));
        expect(mocks.invoke).toHaveBeenCalledWith("discover_carts");
    });
});
