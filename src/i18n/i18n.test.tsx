import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { I18nProvider, useI18n, useT } from "./index";
import { zhCN } from "./zh-CN";

function placeholders(template: string): string[] {
    return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** jsdom reports `en-US`; these tests need to pretend otherwise. */
function pretendSystemLanguage(...tags: string[]): void {
    Object.defineProperty(navigator, "language", { value: tags[0], configurable: true });
    Object.defineProperty(navigator, "languages", { value: tags, configurable: true });
}

afterEach(() => {
    pretendSystemLanguage("en-US");
});

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

describe("language on first launch", () => {
    beforeEach(() => {
        localStorage.removeItem("retrium-language");
    });

    it("follows the system language when nothing is chosen yet", () => {
        pretendSystemLanguage("zh-CN");
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("nav.library")).toBe("资料库");
    });

    it("falls back to the Chinese dictionary for any zh region", () => {
        pretendSystemLanguage("zh-TW");
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("nav.library")).toBe("资料库");
    });

    it("prefers a Chinese system tag even when English comes first", () => {
        pretendSystemLanguage("en-GB", "zh-Hans-CN");
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("nav.library")).toBe("资料库");
    });

    it("uses English for a non-Chinese system language", () => {
        pretendSystemLanguage("de-DE", "de");
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("nav.library")).toBe("Library");
    });

    it("leaves no trace in storage, so a later system change still applies", () => {
        pretendSystemLanguage("zh-CN");
        renderHook(() => useT(), { wrapper: I18nProvider });

        expect(localStorage.getItem("retrium-language")).toBeNull();
    });

    it("lets an explicit choice beat the system language", () => {
        pretendSystemLanguage("zh-CN");
        localStorage.setItem("retrium-language", "en");
        const { result } = renderHook(() => useT(), { wrapper: I18nProvider });

        expect(result.current("nav.library")).toBe("Library");
    });

    it("records an explicit choice", () => {
        pretendSystemLanguage("en-US");
        const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });

        act(() => {
            result.current.setLanguage("zh-CN");
        });

        expect(localStorage.getItem("retrium-language")).toBe("zh-CN");
        expect(result.current.language).toBe("zh-CN");
    });
});
