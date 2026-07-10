import { describe, expect, it } from "vitest";
import {
  formatCredits,
  formatDateTime,
  formatDurationMs,
  formatEffort,
  formatLatency,
  formatMoney,
  formatPlatforms,
} from "../usage-formatting";

describe("usage formatting", () => {
  it("formats credits and money", () => {
    expect(formatCredits(1)).toBe("1 credit");
    expect(formatCredits(1500)).toBe("1,500 credits");
    expect(formatCredits(8.123456)).toBe("8.123456 credits");
    expect(formatMoney(1900)).toBe("$19");
  });

  it("formats effort labels", () => {
    expect(formatEffort("medium")).toBe("Medium");
    expect(formatEffort("x_high")).toBe("X High");
  });

  it("formats dates and latency in a stable timezone", () => {
    expect(formatDateTime("2026-07-04T12:30:00.000Z")).toBe("Jul 4, 2026, 12:30 PM");
    expect(formatLatency("2026-07-04T12:30:00.000Z", "2026-07-04T12:30:01.250Z")).toBe("1.3 s");
    expect(formatDurationMs(320)).toBe("320 ms");
  });

  it("summarizes platforms", () => {
    expect(formatPlatforms(["web", "reddit"])).toBe("web, reddit");
    expect(formatPlatforms([])).toBe("None");
  });
});
