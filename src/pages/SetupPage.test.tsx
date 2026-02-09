import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { SetupPage } from "./SetupPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const defaults = {
    configured: false,
    library: "C:\\Users\\Garrett\\Documents\\Retrium",
    dosbox: "C:\\Program Files (x86)\\DOSBox\\DOSBox.exe",
};

function renderPage(onComplete = vi.fn().mockResolvedValue(undefined), onFinished = vi.fn()) {
    render(
        <SnackbarProvider>
            <SetupPage defaults={defaults} onComplete={onComplete} onFinished={onFinished} />
        </SnackbarProvider>,
    );
    return { onComplete, onFinished };
}

describe("SetupPage", () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockResolvedValue(null);
    });

    it("prefills the default paths", () => {
        renderPage();
        expect(screen.getByLabelText("Library directory")).toHaveValue(defaults.library);
        expect(screen.queryByLabelText("DOSBox executable")).toBeNull();
    });

    it("disables continue until the library path is present", async () => {
        const user = userEvent.setup();
        renderPage();

        const next = screen.getByTestId("continue");
        expect(next).toBeEnabled();

        const library = screen.getByLabelText("Library directory");
        await user.clear(library);
        expect(next).toBeDisabled();
        await user.type(library, "D:\\Retrium");
        expect(next).toBeEnabled();
    });

    it("moves to the dosbox step and completes setup", async () => {
        const user = userEvent.setup();
        const { onComplete, onFinished } = renderPage();

        await user.click(screen.getByTestId("continue"));
        expect(screen.getByText("Which DOSBox should launch your programs?")).toBeTruthy();

        const dosbox = screen.getByLabelText("DOSBox executable");
        await user.clear(dosbox);
        await user.type(dosbox, "E:\\DOSBox\\dosbox.exe");
        await user.click(screen.getByTestId("start-scan"));

        expect(onComplete).toHaveBeenCalledWith(defaults.library, "E:\\DOSBox\\dosbox.exe");
        expect(await screen.findByText("Scanning your library…")).toBeTruthy();

        await screen.findByRole("button", { name: "Enter library" }, { timeout: 3000 });
        await user.click(screen.getByTestId("enter-library"));
        expect(onFinished).toHaveBeenCalled();
    });

    it("shows the error returned while saving", async () => {
        const user = userEvent.setup();
        renderPage(vi.fn().mockRejectedValue("DOSBox executable not found"));

        await user.click(screen.getByTestId("continue"));
        await user.click(screen.getByTestId("start-scan"));

        expect(await screen.findByRole("alert")).toHaveTextContent("DOSBox executable not found");
    });

    it("fills the library path chosen in the folder dialog", async () => {
        invoke.mockResolvedValue("D:\\Retrium");
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getAllByRole("button", { name: "Browse" })[0]);

        expect(await screen.findByDisplayValue("D:\\Retrium")).toBeTruthy();
        expect(invoke).toHaveBeenCalledWith("pick_library_directory");
    });
});
