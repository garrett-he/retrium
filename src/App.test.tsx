import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: vi.fn((path: string) => path),
    invoke: vi.fn(async (cmd: string) => {
        if (cmd === "discover_programs") {
            return [{ id: "doom", dir: "/games/doom", info: { name: "Doom" } }];
        }
        return cmd === "get_dosbox_versions" ? {} : [];
    }),
}));

describe("App", () => {
    it("renders without errors", () => {
        const { container } = render(<App />);
        expect(container).toBeTruthy();
    });

    it("renders the programs page after loading", async () => {
        render(<App />);
        expect(await screen.findByText("Programs")).toBeTruthy();
        expect(await screen.findByText("Doom")).toBeTruthy();
    });
});
