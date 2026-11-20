import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doom, makeBackend, oneTarget, processFor } from "@/__mocks__/backend";
import { CartsProvider } from "@/hooks/useCarts";
import { SnackbarProvider } from "@/hooks/useSnackbar";
import { I18nProvider } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import type { Cart } from "@/types";
import { CartPage } from "./CartPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((p: string) => p), invoke }));

function renderPage() {
    return render(
        <I18nProvider>
            <MemoryRouter initialEntries={[`/carts/${doom.id}`]}>
                <SnackbarProvider>
                    <CartsProvider>
                        <Routes>
                            <Route path="/carts/:id" element={<CartPage />} />
                            <Route path="/" element={<div>library home</div>} />
                        </Routes>
                    </CartsProvider>
                </SnackbarProvider>
            </MemoryRouter>
        </I18nProvider>,
    );
}

describe("CartPage", () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(makeBackend());
    });

    it("renders the hero, stats, revision and metadata", async () => {
        renderPage();
        expect(await screen.findByRole("heading", { name: "Doom" })).toBeTruthy();
        expect(screen.getByText(formatDateTime(doom.createdAt))).toBeTruthy();
        expect(screen.getByText("1h 30m")).toBeTruthy();
        expect(screen.getByText("3×")).toBeTruthy();
        expect(screen.getByText("id Software")).toBeTruthy();
        expect(screen.getByText("MS-DOS 5.0")).toBeTruthy();
        expect(screen.getByText("FPS")).toBeTruthy();
        expect(screen.getByText("r3")).toBeTruthy();
        expect(screen.getByText("unexported")).toBeTruthy();
        expect(screen.getByText(doom.id)).toBeTruthy();
    });

    it("runs the default target from the main button", async () => {
        const user = userEvent.setup();
        renderPage();
        const button = await screen.findByRole("button", { name: "Run Main game" });
        expect(button.textContent).toContain("Run Main game");

        await user.click(button);

        expect(invoke).toHaveBeenCalledWith("run_cart", { id: doom.id, targetId: "play" });
        expect(await screen.findByText("Launched Doom · Main game")).toBeTruthy();
    });

    it("lists every target and passes the chosen id without changing the default", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(await screen.findByLabelText("Choose target"));
        expect(await screen.findByText("Sound setup")).toBeTruthy();
        expect(screen.getByText("SETUP.EXE")).toBeTruthy();

        await user.click(screen.getByText("Sound setup"));
        expect(invoke).toHaveBeenCalledWith("run_cart", { id: doom.id, targetId: "setup" });
    });

    it("hides the dropdown when the cart has a single target", async () => {
        invoke.mockImplementation(makeBackend({ launch: oneTarget }));
        renderPage();
        await screen.findByTestId("run-default");

        expect(screen.queryByLabelText("Choose target")).toBeNull();
    });

    it("disables the run button and explains a broken launch configuration", async () => {
        invoke.mockImplementation(
            makeBackend({
                launch: {
                    targets: [],
                    error: "targets[1].executable: file not found",
                },
            }),
        );
        renderPage();
        const button = await screen.findByTestId("run-default");

        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("launch-error").textContent).toContain("targets[1].executable: file not found");
    });

    it("shows Stop instead of Run while the cart is running", async () => {
        invoke.mockImplementation(makeBackend({ processes: [processFor(doom)] }));
        const user = userEvent.setup();
        renderPage();

        expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy();
        expect(screen.queryByTestId("run-default")).toBeNull();

        await user.click(screen.getByRole("button", { name: "Stop" }));
        expect(invoke).toHaveBeenCalledWith("stop_cart", { id: doom.id });
        expect(await screen.findByText("Doom stopped")).toBeTruthy();
    });

    it("sends every metadata field including author and DOS details", { timeout: 20000 }, async () => {
        const user = userEvent.setup({ delay: null });
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.clear(screen.getByLabelText("Platform"));
        await user.type(screen.getByLabelText("Platform"), "DOS 6.22");
        await user.clear(screen.getByLabelText("Players"));
        await user.type(screen.getByLabelText("Players"), "8");
        await user.clear(screen.getByLabelText("External ids"));
        await user.type(screen.getByLabelText("External ids"), "igdb=1029");
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(invoke).toHaveBeenCalledWith("update_cart_info", {
            id: doom.id,
            info: expect.objectContaining({
                platform: "DOS 6.22",
                players: 8,
                externalIds: { igdb: "1029" },
                dos: expect.objectContaining({ version: "MS-DOS 5.0" }),
            }),
            author: { name: "Garrett", email: "garrett@example.com" },
        });
        expect(await screen.findByText("Metadata saved")).toBeTruthy();
    });

    it("drops the author when both fields are cleared", { timeout: 20000 }, async () => {
        const user = userEvent.setup({ delay: null });
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.clear(screen.getByLabelText("Author name"));
        await user.clear(screen.getByLabelText("Author email"));
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(invoke).toHaveBeenCalledWith("update_cart_info", expect.objectContaining({ author: undefined }));
    });

    it("resets progress only after confirmation", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Reset progress" }));
        expect(await screen.findByText("Reset progress?")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Reset" }));

        expect(invoke).toHaveBeenCalledWith("reset_cart", { id: doom.id });
        expect(await screen.findByText("Progress reset")).toBeTruthy();
    });

    it("repairs the program only after confirmation", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Repair program" }));
        expect(await screen.findByText("Repair program files?")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Repair" }));

        expect(invoke).toHaveBeenCalledWith("repair_cart", { id: doom.id });
    });

    it("exports through the revision prompt and saves a copy", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Export…" }));

        const revision = await screen.findByLabelText("Revision");
        expect((revision as HTMLInputElement).value).toBe("4");

        await user.click(screen.getByRole("button", { name: "Export cart…" }));

        expect(invoke).toHaveBeenCalledWith("commit_cart", { id: doom.id, revision: 4 });
        expect(invoke).toHaveBeenCalledWith("export_cart_file", { id: doom.id });
        expect(await screen.findByText("Exported Doom.cart")).toBeTruthy();
    });

    it("warns when content changed but the revision stays the same", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Export…" }));
        const revision = await screen.findByLabelText("Revision");
        await user.clear(revision);
        await user.type(revision, "3");

        expect(await screen.findByText(/two different contents/)).toBeTruthy();
    });

    it("deletes the cart after confirmation and navigates home", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(screen.getByRole("button", { name: "Delete permanently" }));

        expect(invoke).toHaveBeenCalledWith("delete_cart", { id: doom.id });
        expect(await screen.findByText("library home")).toBeTruthy();
    });

    it("opens the cart folder from the action row", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Browse" }));
        expect(invoke).toHaveBeenCalledWith("open_cart_folder", { id: doom.id });
        expect(await screen.findByText("Opened Doom folder")).toBeTruthy();
    });

    it("goes back to the library from the back button", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { name: "Doom" });

        await user.click(screen.getByRole("button", { name: "Library" }));
        expect(await screen.findByText("library home")).toBeTruthy();
    });

    it("shows a fallback when the cart is unknown", async () => {
        invoke.mockImplementation(makeBackend({ carts: [] as Cart[] }));
        render(
            <I18nProvider>
                <MemoryRouter initialEntries={["/carts/missing"]}>
                    <SnackbarProvider>
                        <CartsProvider>
                            <Routes>
                                <Route path="/carts/:id" element={<CartPage />} />
                            </Routes>
                        </CartsProvider>
                    </SnackbarProvider>
                </MemoryRouter>
            </I18nProvider>,
        );
        expect(await screen.findByText("Cart not found")).toBeTruthy();
    });
});
