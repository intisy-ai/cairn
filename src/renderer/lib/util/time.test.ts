import { describe, it, expect } from "vitest";
import { relativeTime, whenLabel } from "./time.js";

const NOW = new Date("2026-08-06T12:00:00Z").getTime();
const seconds = (n: number) => NOW - n * 1000;
const minutes = (n: number) => seconds(n * 60);
const hours = (n: number) => minutes(n * 60);
const days = (n: number) => hours(n * 24);

describe("relativeTime", () => {
  it("reads as just now under a minute", () => {
    expect(relativeTime(seconds(5), NOW)).toBe("just now");
    expect(relativeTime(seconds(59), NOW)).toBe("just now");
  });

  it("steps up through minutes, hours and days", () => {
    expect(relativeTime(minutes(5), NOW)).toBe("5m ago");
    expect(relativeTime(hours(3), NOW)).toBe("3h ago");
    expect(relativeTime(days(2), NOW)).toBe("2d ago");
  });

  it("never reports a negative age for a clock that ran ahead", () => {
    expect(relativeTime(NOW + 60_000, NOW)).toBe("just now");
  });
});

describe("whenLabel", () => {
  it("stays relative inside a week, where it still means something", () => {
    expect(whenLabel(hours(2), NOW)).toBe("2h ago");
    expect(whenLabel(days(6), NOW)).toBe("6d ago");
  });

  it("becomes a date once relative stops being useful", () => {
    const old = days(30);
    expect(whenLabel(old, NOW)).toBe(new Date(old).toLocaleDateString());
  });
});
