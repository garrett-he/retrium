import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetupPage } from "./SetupPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const defaults = {
    configured: false,
    library: "C:\\Users\\Garrett\\Documents\\Retrium",
    dosbox: "C:\\Program Files (x86)\\DOSBox\\DOSBox.exe",
};

function renderPage(onComplete = vi.fn().mockResolvedValue(undefined)) {
    render(<SetupPage defaults={defaults} onComplete={onComplete} />);
    return onComplete;
}

describe("SetupPage", () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it("prefills the default paths", () => {
        renderPage();
        expect(screen.getByLabelText("Library directory")).toHaveValue(defaults.library);
        expect(screen.getByLabelText("DOSBox executable")).toHaveValue(defaults.dosbox);
    });

    it("submits the entered paths", async () => {
        const user = userEvent.setup();
        const onComplete = renderPage();

        const library = screen.getByLabelText("Library directory");
        await user.clear(library);
        await user.type(library, "D:\\Retrium");
        await user.click(screen.getByRole("button", { name: "Get started" }));

        expect(onComplete).toHaveBeenCalledWith("D:\\Retrium", defaults.dosbox);
    });

    it("shows the error returned while saving", async () => {
        const user = userEvent.setup();
        renderPage(vi.fn().mockRejectedValue("DOSBox executable not found"));

        await user.click(screen.getByRole("button", { name: "Get started" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("DOSBox executable not found");
    });

    it("fills the DOSBox path chosen in the file dialog", async () => {
        invoke.mockResolvedValue("E:\\DOSBox\\DOSBox.exe");
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getAllByRole("button", { name: "Browse" })[1]);

        expect(await screen.findByDisplayValue("E:\\DOSBox\\DOSBox.exe")).toBeTruthy();
        expect(invoke).toHaveBeenCalledWith("pick_dosbox_executable");
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
