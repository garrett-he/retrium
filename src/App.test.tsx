import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const mocks = vi.hoisted(() => ({ configured: true }));

vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: vi.fn((path: string) => path),
    invoke: vi.fn(async (cmd: string) => {
        if (cmd === "get_setup_state") {
            return { configured: mocks.configured, library: "/games", dosbox: "/usr/bin/dosbox" };
        }
        if (cmd === "discover_programs") {
            return [{ id: "doom", dir: "/games/doom", info: { name: "Doom" } }];
        }
        return cmd === "get_dosbox_versions" ? {} : [];
    }),
}));

describe("App", () => {
    afterEach(() => {
        mocks.configured = true;
    });

    it("renders without errors", () => {
        const { container } = render(<App />);
        expect(container).toBeTruthy();
    });

    it("renders the programs page after loading", async () => {
        render(<App />);
        expect(await screen.findByText("Programs")).toBeTruthy();
        expect(await screen.findByText("Doom")).toBeTruthy();
    });

    it("renders the setup page on first run", async () => {
        mocks.configured = false;
        render(<App />);
        expect(await screen.findByText("Welcome to Retrium")).toBeTruthy();
        expect(screen.queryByText("Programs")).toBeNull();
    });
});
