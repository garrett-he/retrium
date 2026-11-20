import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { I18nProvider, useT } from "./index";
import { zhCN } from "./zh-CN";

function placeholders(template: string): string[] {
    return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("dictionaries", () => {
    it("keeps the same placeholders in every language", () => {
        for (const [key, template] of Object.entries(en)) {
            expect(placeholders(zhCN[key as keyof typeof en]), key).toEqual(placeholders(template));
        }
    });

    it("never ships an empty string", () => {
        for (const [key, template] of Object.entries(en)) {
            expect(template.trim(), key).not.toBe("");
            expect(zhCN[key as keyof typeof en].trim(), key).not.toBe("");
        }
    });
});

describe("t", () => {
    beforeEach(() => {
        localStorage.removeItem("retrium-language");
    });

    it("fills placeholders and picks the plural form from count", () => {
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("running.summary", { count: 1 })).toBe("1 cart emulated in DOSBox");
        expect(result.current("running.summary", { count: 3 })).toBe("3 carts emulated in DOSBox");
        expect(result.current("library.toast.launched", { name: "Doom", target: "Setup" })).toBe(
            "Launched Doom · Setup",
        );
    });

    it("leaves an unmatched placeholder visible instead of printing undefined", () => {
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("library.toast.launched", { name: "Doom" })).toBe("Launched Doom · {target}");
    });

    it("switches language from storage", () => {
        localStorage.setItem("retrium-language", "zh-CN");
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("nav.library")).toBe("资料库");
        expect(result.current("running.summary", { count: 2 })).toBe("DOSBox 中正在运行 2 个卡带");
    });
});
