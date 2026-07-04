import { describe, expect, it } from "vitest";
import { createMockProviderClients, normalizeProviderPublishedAt } from "../index.js";

describe("provider normalization", () => {
  it("normalizes provider date formats to ISO datetimes", () => {
    expect(normalizeProviderPublishedAt("1728734325")).toBe("2024-10-12T11:58:45.000Z");
    expect(normalizeProviderPublishedAt("Sat Oct 12 11:58:45 +0000 2024")).toBe(
      "2024-10-12T11:58:45.000Z",
    );
    expect(normalizeProviderPublishedAt("not a date")).toBeNull();
  });

  it("does not fail provider calls when operational logging fails", async () => {
    const providers = createMockProviderClients(() => {
      throw new Error("provider_call_logs insert failed");
    });

    await expect(
      providers.exa.search({
        requestId: "ctx_test",
        query: "SupaContext",
        platform: "web",
        limit: 1,
      }),
    ).resolves.toHaveLength(1);
  });
});
