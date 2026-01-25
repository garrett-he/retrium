import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProgramsProvider } from "@/hooks/usePrograms";
import { IndexPage } from "./IndexPage";

vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: vi.fn((path: string) => path),
    invoke: vi.fn(async (cmd: string) => {
        if (cmd === "get_setup_state") {
            return { configured: true, library: "/games", dosbox: "/usr/bin/dosbox" };
        }
        if (cmd === "discover_programs") {
            return [
                { id: "doom", dir: "/games/doom", info: { name: "Doom", category: "Games" } },
                { id: "wolf", dir: "/games/wolf", info: { name: "Wolfenstein", category: "Games" } },
            ];
        }
        return cmd === "get_dosbox_versions" ? {} : [];
    }),
}));

function renderPage() {
    return render(
        <MemoryRouter>
            <ProgramsProvider>
                <IndexPage />
            </ProgramsProvider>
        </MemoryRouter>,
    );
}

describe("IndexPage", () => {
    it("renders the programs header", async () => {
        renderPage();
        expect(await screen.findByText("Programs")).toBeTruthy();
    });

    it("renders discovered programs", async () => {
        renderPage();
        expect(await screen.findByText("Doom")).toBeTruthy();
        expect(await screen.findByText("Wolfenstein")).toBeTruthy();
    });

    it("renders the category filter with counts", async () => {
        renderPage();
        expect(await screen.findByText(/All \(2\)/)).toBeTruthy();
        expect(await screen.findByText(/Games \(2\)/)).toBeTruthy();
    });
});
