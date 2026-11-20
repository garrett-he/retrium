import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBackend } from "@/__mocks__/backend";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { I18nProvider } from "@/i18n";
import { SettingsPage } from "./SettingsPage";

const { invoke, openUrl } = vi.hoisted(() => ({
    invoke: vi.fn(),
    openUrl: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

const probe = { path: "C:\\DOSBox\\dosbox.exe", exists: true, version: "DOSBox 0.74-3" };

function renderPage(mode: "dark" | "light" = "dark", onModeChange = vi.fn()) {
    return render(
        <I18nProvider>
            <MemoryRouter>
                <SnackbarProvider>
                    <CartsProvider>
                        <SettingsPage mode={mode} onModeChange={onModeChange} />
                    </CartsProvider>
                </SnackbarProvider>
            </MemoryRouter>
        </I18nProvider>,
    );
}

describe("SettingsPage", () => {
    beforeEach(() => {
        localStorage.removeItem("retrium-language");
        invoke.mockReset();
        invoke.mockImplementation(
            makeBackend({
                carts: [],
                probe,
                handlers: {
                    get_setup_state: () => ({
                        configured: true,
                        library: "C:\\Games",
                        dosbox: "C:\\DOSBox\\dosbox.exe",
                    }),
                    get_dosbox_path: () => probe,
                },
            }),
        );
    });

    it("renders storage, a single DOSBox path, appearance and about", async () => {
        renderPage();
        expect(await screen.findByText("C:\\Games")).toBeTruthy();
        expect(screen.getByText("DOSBox")).toBeTruthy();
        expect(screen.queryByText("DOSBox versions")).toBeNull();
        expect(screen.queryByLabelText(/Set .* as default/)).toBeNull();
        expect(screen.getByText("Appearance")).toBeTruthy();
        expect(screen.getByText("GPL-3.0-or-later")).toBeTruthy();
    });

    it("shows the stored path and the detected version", async () => {
        renderPage();
        expect(await screen.findByDisplayValue("C:\\DOSBox\\dosbox.exe")).toBeTruthy();
        expect(await screen.findByText("Found DOSBox DOSBox 0.74-3")).toBeTruthy();
    });

    it("switches the interface language and remembers the choice", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Storage");

        await user.click(screen.getByLabelText("Language"));
        await user.click(await screen.findByRole("option", { name: "简体中文" }));

        expect(await screen.findByText("存储")).toBeTruthy();
        expect(screen.getByText("外观")).toBeTruthy();
        expect(screen.queryByText("Storage")).toBeNull();
        expect(localStorage.getItem("retrium-language")).toBe("zh-CN");
        expect(document.documentElement.lang).toBe("zh-CN");
    });

    it("opens the homepage in the default browser", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("https://github.com/garrett-he/retrium");

        await user.click(screen.getByLabelText("Open homepage"));
        expect(openUrl).toHaveBeenCalledWith("https://github.com/garrett-he/retrium");
    });

    it("tests a new path without saving it", async () => {
        const user = userEvent.setup();
        renderPage();
        const field = await screen.findByDisplayValue("C:\\DOSBox\\dosbox.exe");

        await user.clear(field);
        await user.type(field, "C:\\Other\\dosbox.exe");
        await user.click(screen.getByRole("button", { name: "Test" }));

        expect(invoke).toHaveBeenCalledWith("probe_dosbox_path", { path: "C:\\Other\\dosbox.exe" });
        expect(invoke).not.toHaveBeenCalledWith("set_dosbox_path", expect.anything());
    });

    it("saves a path whose version cannot be detected", async () => {
        invoke.mockImplementation(
            makeBackend({
                carts: [],
                handlers: {
                    get_setup_state: () => ({
                        configured: true,
                        library: "C:\\Games",
                        dosbox: "C:\\DOSBox\\dosbox.exe",
                    }),
                    get_dosbox_path: () => probe,
                    set_dosbox_path: (args) => ({ path: args.path, exists: true }),
                },
            }),
        );
        const user = userEvent.setup();
        renderPage();
        const field = await screen.findByDisplayValue("C:\\DOSBox\\dosbox.exe");

        await user.clear(field);
        await user.type(field, "C:\\Other\\dosbox.exe");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(invoke).toHaveBeenCalledWith("set_dosbox_path", { path: "C:\\Other\\dosbox.exe" });
        expect(await screen.findByText("DOSBox path saved (version unknown)")).toBeTruthy();
    });

    it("reports a missing executable", async () => {
        invoke.mockImplementation(
            makeBackend({
                carts: [],
                handlers: {
                    get_setup_state: () => ({ configured: true, library: "C:\\Games", dosbox: "C:\\nope.exe" }),
                    get_dosbox_path: () => ({ path: "C:\\nope.exe", exists: false }),
                    probe_dosbox_path: () => ({ path: "C:\\nope.exe", exists: false }),
                },
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await screen.findByDisplayValue("C:\\nope.exe");

        await user.click(screen.getByRole("button", { name: "Test" }));
        expect(await screen.findByText("No executable at C:\\nope.exe")).toBeTruthy();
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
        invoke.mockImplementation(
            makeBackend({
                carts: [],
                handlers: {
                    get_setup_state: () => ({
                        configured: true,
                        library: "C:\\Games",
                        dosbox: "C:\\DOSBox\\dosbox.exe",
                    }),
                    get_dosbox_path: () => probe,
                    pick_library_directory: () => "D:\\Retrium",
                },
            }),
        );
        renderPage();
        await screen.findByText("Storage");

        await user.click(screen.getByRole("button", { name: "Change directory" }));

        expect(invoke).toHaveBeenCalledWith("set_library_directory", { library: "D:\\Retrium" });
        expect(await screen.findByText("Library moved to D:\\Retrium")).toBeTruthy();
    });
});
