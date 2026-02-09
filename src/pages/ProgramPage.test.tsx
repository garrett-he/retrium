import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramsProvider } from "@/hooks/usePrograms";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { ProgramPage } from "./ProgramPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

const program = {
    id: "doom",
    dir: "/games/doom",
    info: {
        name: "Doom",
        category: "Action",
        release: 1993,
        developer: "id Software",
        publisher: "GT Interactive",
        series: "Doom",
        language: "English",
        tags: ["FPS", "Moddable"],
    },
};

function mockResponse(cmd: string) {
    if (cmd === "get_setup_state") {
        return { configured: true, library: "/games", dosbox: "/usr/bin/dosbox" };
    }
    if (cmd === "discover_programs") {
        return [program];
    }
    if (cmd === "get_dosbox_versions") {
        return {
            default: "DOSBox",
            versions: [
                { name: "DOSBox", path: "/usr/bin/dosbox" },
                { name: "Staging", path: "/usr/bin/dosbox-staging" },
            ],
        };
    }
    if (cmd === "get_program_summaries") {
        return { doom: { lastRun: "2026-01-02T00:00:00Z", runs: 3, elapsed: 5400 } };
    }
    if (cmd === "list_program_processes") {
        return [];
    }
    if (cmd === "update_program_info") {
        return { ...program, info: { ...program.info, name: "Doom Reloaded" } };
    }
    return [];
}

function mockBackend() {
    invoke.mockImplementation(async (cmd: string) => mockResponse(cmd));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/programs/doom"]}>
            <SnackbarProvider>
                <ProgramsProvider>
                    <Routes>
                        <Route path="/programs/:id" element={<ProgramPage />} />
                        <Route path="/" element={<div>library home</div>} />
                    </Routes>
                </ProgramsProvider>
            </SnackbarProvider>
        </MemoryRouter>,
    );
}

describe("ProgramPage", () => {
    beforeEach(() => {
        mockBackend();
    });

    it("renders the hero, stats and metadata", async () => {
        renderPage();
        expect(await screen.findByRole("heading", { name: "Doom" })).toBeTruthy();
        expect(screen.getByText("1h 30m")).toBeTruthy();
        expect(screen.getByText("3×")).toBeTruthy();
        expect(screen.getByText("id Software")).toBeTruthy();
        expect(screen.getByText("/games/doom")).toBeTruthy();
        expect(screen.getByText("FPS")).toBeTruthy();
    });

    it("runs with the default dosbox version via the split button", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByTestId("run-default"));

        expect(invoke).toHaveBeenCalledWith(
            "run_program",
            expect.objectContaining({ options: expect.objectContaining({ dosboxVersion: "DOSBox" }) }),
        );
        expect(await screen.findByText("Launched Doom in DOSBox DOSBox")).toBeTruthy();
    });

    it("opens the version menu and runs with a specific version", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByLabelText("Choose DOSBox version"));
        await user.click(screen.getByText("Staging"));

        expect(invoke).toHaveBeenCalledWith(
            "run_program",
            expect.objectContaining({ options: expect.objectContaining({ dosboxVersion: "Staging" }) }),
        );
    });

    it("edits metadata through the dialog and saves", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Edit" }));
        const nameField = screen.getByLabelText("Name");
        await user.clear(nameField);
        await user.type(nameField, "Doom Reloaded");
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(invoke).toHaveBeenCalledWith(
            "update_program_info",
            expect.objectContaining({ info: expect.objectContaining({ name: "Doom Reloaded" }) }),
        );
        expect(await screen.findByText("Metadata saved")).toBeTruthy();
        expect(await screen.findByRole("heading", { name: "Doom Reloaded" })).toBeTruthy();
    });

    it("deletes the program after confirmation and navigates home", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(screen.getByRole("button", { name: "Delete permanently" }));

        expect(invoke).toHaveBeenCalledWith("delete_program", { program });
        expect(await screen.findByText("library home")).toBeTruthy();
    });

    it("stops a running program and opens the folder", async () => {
        invoke.mockImplementation(async (cmd: string) => {
            if (cmd === "list_program_processes") {
                return [
                    {
                        pid: 7,
                        program,
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

        await user.click(screen.getByRole("button", { name: "Stop" }));
        expect(invoke).toHaveBeenCalledWith("stop_program", { program });
        expect(await screen.findByText("Doom stopped")).toBeTruthy();
    });

    it("exports an archive from the action row", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Export" }));
        expect(invoke).toHaveBeenCalledWith("archive_program", { program });
        expect(await screen.findByText("Exported Doom.zip")).toBeTruthy();
    });

    it("opens the program folder from the action row", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Browse" }));
        expect(invoke).toHaveBeenCalledWith("open_program_folder", { program });
        expect(await screen.findByText("Opened /games/doom")).toBeTruthy();
    });

    it("goes back to the library from the back button", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Library" }));
        expect(await screen.findByText("library home")).toBeTruthy();
    });

    it("edits all metadata fields through the dialog", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.clear(screen.getByLabelText("Developer"));
        await user.type(screen.getByLabelText("Developer"), "id Software 1993");
        await user.clear(screen.getByLabelText("Publisher"));
        await user.type(screen.getByLabelText("Publisher"), "GT Interactive");
        await user.clear(screen.getByLabelText("Series"));
        await user.type(screen.getByLabelText("Series"), "DOOM");
        await user.clear(screen.getByLabelText("Tags (comma separated)"));
        await user.type(screen.getByLabelText("Tags (comma separated)"), "FPS, Retro, Moddable");
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(invoke).toHaveBeenCalledWith(
            "update_program_info",
            expect.objectContaining({
                info: expect.objectContaining({
                    developer: "id Software 1993",
                    publisher: "GT Interactive",
                    series: "DOOM",
                    tags: ["FPS", "Retro", "Moddable"],
                }),
            }),
        );
    });

    it("shows a fallback when the program is unknown", async () => {
        render(
            <MemoryRouter initialEntries={["/programs/unknown"]}>
                <SnackbarProvider>
                    <ProgramsProvider>
                        <Routes>
                            <Route path="/programs/:id" element={<ProgramPage />} />
                        </Routes>
                    </ProgramsProvider>
                </SnackbarProvider>
            </MemoryRouter>,
        );
        expect(await screen.findByText("Program not found")).toBeTruthy();
    });
});
