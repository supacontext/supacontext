import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockProviderClients,
  createProviderClients,
  normalizeProviderPublishedAt,
} from "../index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
        query: "Supacontext",
        platform: "web",
        limit: 1,
      }),
    ).resolves.toHaveLength(1);
  });

  it("normalizes relative Reddit permalinks to absolute source URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "thread_1",
                title: "Supacontext discussion",
                permalink: "/r/supacontext/comments/thread_1/supacontext_discussion/",
                selftext: "Reddit discussion with useful context.",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
    );
    const providers = createProviderClients({
      mode: "real",
      env: {
        exaApiKey: "test-exa-key",
        fetchLayerApiKey: "test-fetchlayer-key",
        xquikApiKey: "test-xquik-key",
        supadataApiKey: "test-supadata-key",
        deepseekApiKey: "test-deepseek-key",
        voyageApiKey: "test-voyage-key",
      },
    });

    const results = await providers.fetchlayer.searchReddit({
      requestId: "ctx_test",
      query: "Supacontext",
      limit: 1,
    });

    expect(results[0]?.url).toBe(
      "https://www.reddit.com/r/supacontext/comments/thread_1/supacontext_discussion/",
    );
  });
});
