import { describe, expect, it } from "vitest";
import { formatPlaytime, formatUptime } from "./format";

describe("formatPlaytime", () => {
    it("formats hours and minutes", () => {
        expect(formatPlaytime(5400)).toBe("1h 30m");
    });

    it("formats minutes only", () => {
        expect(formatPlaytime(125)).toBe("2m");
    });

    it("rounds up stray seconds into minutes", () => {
        expect(formatPlaytime(3599)).toBe("1h 00m");
    });
});

describe("formatUptime", () => {
    it("formats under one hour as m:ss", () => {
        const startedAt = new Date("2026-01-01T10:00:00Z").toISOString();
        const now = new Date("2026-01-01T10:01:05Z").getTime();
        expect(formatUptime(startedAt, now)).toBe("1:05");
    });

    it("formats over one hour as h:mm:ss", () => {
        const startedAt = new Date("2026-01-01T10:00:00Z").toISOString();
        const now = new Date("2026-01-01T11:02:03Z").getTime();
        expect(formatUptime(startedAt, now)).toBe("1:02:03");
    });

    it("falls back to zero for invalid timestamps", () => {
        expect(formatUptime("not-a-date", 1000)).toBe("0:00");
    });

    it("never returns a negative duration", () => {
        const startedAt = new Date("2026-01-01T10:00:00Z").toISOString();
        const now = new Date("2026-01-01T09:00:00Z").getTime();
        expect(formatUptime(startedAt, now)).toBe("0:00");
    });
});
