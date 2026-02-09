import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramsProvider } from "@/hooks/usePrograms";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { SettingsPage } from "./SettingsPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

function mockResponse(cmd: string) {
    if (cmd === "get_setup_state") {
        return { configured: true, library: "C:\\Games", dosbox: "C:\\DOSBox\\dosbox.exe" };
    }
    if (cmd === "discover_programs") {
        return [];
    }
    if (cmd === "get_dosbox_versions") {
        return {
            default: "DOSBox",
            versions: [
                { name: "DOSBox", path: "C:\\DOSBox\\dosbox.exe" },
                { name: "Staging", path: "C:\\DOSBox\\staging.exe" },
            ],
        };
    }
    if (cmd === "get_program_summaries" || cmd === "list_program_processes") {
        return {};
    }
    if (cmd === "pick_dosbox_executable") {
        return "E:\\DOSBox\\dosbox.exe";
    }
    return [];
}

function mockBackend() {
    invoke.mockImplementation(async (cmd: string) => mockResponse(cmd));
}

function renderPage(mode: "dark" | "light" = "dark", onModeChange = vi.fn()) {
    return render(
        <MemoryRouter>
            <SnackbarProvider>
                <ProgramsProvider>
                    <SettingsPage mode={mode} onModeChange={onModeChange} />
                </ProgramsProvider>
            </SnackbarProvider>
        </MemoryRouter>,
    );
}

describe("SettingsPage", () => {
    beforeEach(() => {
        mockBackend();
    });

    it("renders storage, versions, appearance and about sections", async () => {
        renderPage();

        expect(await screen.findByText("C:\\Games")).toBeTruthy();
        expect(screen.getByText("DOSBox versions")).toBeTruthy();
        expect(screen.getByText("Appearance")).toBeTruthy();
        expect(screen.getByText("GPL-3.0-or-later")).toBeTruthy();
    });

    it("sets a dosbox version as default via the radio", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Staging");

        await user.click(screen.getByLabelText("Set Staging as default"));

        expect(invoke).toHaveBeenCalledWith("set_default_dosbox_version", { name: "Staging" });
        expect(await screen.findByText("Staging is now the default DOSBox")).toBeTruthy();
    });

    it("removes a non-default version", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Staging");

        await user.click(screen.getByLabelText("Remove Staging"));

        expect(invoke).toHaveBeenCalledWith("remove_dosbox_version", { name: "Staging" });
    });

    it("adds a new dosbox version through the dialog", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Staging");

        await user.click(screen.getByRole("button", { name: "Add" }));
        await user.type(screen.getByLabelText("Display name"), "DOSBox-X");
        await user.type(screen.getByLabelText("Executable path"), "C:\\DOSBox-X\\dosbox-x.exe");
        await user.click(screen.getByRole("button", { name: "Add version" }));

        expect(invoke).toHaveBeenCalledWith("add_dosbox_version", {
            name: "DOSBox-X",
            path: "C:\\DOSBox-X\\dosbox-x.exe",
        });
        expect(await screen.findByText("DOSBox version added")).toBeTruthy();
    });

    it("fills the executable path from the file dialog", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Staging");

        await user.click(screen.getByRole("button", { name: "Add" }));
        await user.click(screen.getByRole("button", { name: "Browse" }));

        expect(await screen.findByDisplayValue("E:\\DOSBox\\dosbox.exe")).toBeTruthy();
        expect(invoke).toHaveBeenCalledWith("pick_dosbox_executable");
    });

    it("switches the appearance mode", async () => {
        const user = userEvent.setup();
        const onModeChange = vi.fn();
        renderPage("dark", onModeChange);
        await screen.findByText("Appearance");

        await user.click(screen.getByText("Yellowed manual"));

        expect(onModeChange).toHaveBeenCalledWith("light");
    });

    it("changes the library directory via the folder picker", async () => {
        const user = userEvent.setup();
        invoke.mockImplementation(async (cmd: string) => {
            if (cmd === "pick_library_directory") {
                return "D:\\Retrium";
            }
            return mockResponse(cmd);
        });
        renderPage();
        await screen.findByText("DOSBox versions");

        await user.click(screen.getByRole("button", { name: "Change directory" }));

        expect(invoke).toHaveBeenCalledWith("set_library_directory", { library: "D:\\Retrium" });
        expect(await screen.findByText("Library moved to D:\\Retrium")).toBeTruthy();
    });
});
