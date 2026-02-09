import { describe, expect, it } from "vitest";
import { buildTheme } from "./theme";

describe("buildTheme", () => {
    it("uses the amber terminal palette in dark mode", () => {
        const theme = buildTheme("dark");
        expect(theme.palette.mode).toBe("dark");
        expect(theme.palette.primary.main).toBe("#FFB300");
        expect(theme.palette.background.default).toBe("#171412");
    });

    it("uses the yellowed manual palette in light mode", () => {
        const theme = buildTheme("light");
        expect(theme.palette.mode).toBe("light");
        expect(theme.palette.primary.main).toBe("#9A6100");
        expect(theme.palette.background.default).toBe("#F0E8D9");
    });

    it("keeps a consistent border radius across modes", () => {
        expect(buildTheme("dark").shape.borderRadius).toBe(buildTheme("light").shape.borderRadius);
    });
});
