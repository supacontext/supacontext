import { describe, expect, it } from "vitest";
import { contextRequestInputSchema } from "../validation.js";

describe("context request validation", () => {
  it("trims and validates webhook URLs", () => {
    const parsed = contextRequestInputSchema.parse({
      query: "SupaContext",
      webhook_url: " https://example.com/webhook ",
    });

    expect(parsed.webhook_url).toBe("https://example.com/webhook");
  });

  it("limits metadata size", () => {
    expect(
      contextRequestInputSchema.safeParse({
        query: "SupaContext",
        metadata: Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`key_${index}`, true])),
      }).success,
    ).toBe(false);

    expect(
      contextRequestInputSchema.safeParse({
        query: "SupaContext",
        metadata: {
          oversized: "x".repeat(4097),
        },
      }).success,
    ).toBe(false);
  });
});
