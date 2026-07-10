import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOL_OPERATION_PRICING } from "@supacontext/core";
import {
  API_DIRECT_OPERATIONS,
  DEEPSEEK_MODELS,
  GITHUB_OPERATIONS,
  GITHUB_TOKEN_REQUIREMENT,
  GROQ_ROUTER_MODEL,
  HACKER_NEWS_OPERATIONS,
  REDDIT_OPERATIONS,
  X_OPERATIONS,
  cleanProviderText,
  createMockProviderClients,
  createProviderClients,
  normalizeProviderPublishedAt,
  type ProviderBaseUrls,
  type ProviderCallLogger,
  type ProviderClientEnv,
} from "../index.js";

const env: Partial<ProviderClientEnv> = {
  nodeEnv: "test",
  exaApiKey: "test-exa-key",
  fetchLayerApiKey: "test-fetchlayer-key",
  apiDirectApiKey: "test-apidirect-key",
  supadataApiKey: "test-supadata-key",
  githubPat: "test-github-pat",
  deepseekApiKey: "test-deepseek-key",
  groqApiKey: "test-groq-key",
  voyageApiKey: "test-voyage-key",
};

const baseUrls: ProviderBaseUrls = {
  exa: "https://exa.test",
  fetchlayer: "https://fetchlayer.test/api",
  apiDirect: "https://apidirect.test",
  supadata: "https://supadata.test/v1",
  hackerNewsAlgolia: "https://algolia.test/api/v1",
  hackerNewsFirebase: "https://firebase.test/v0",
  github: "https://github.test",
  voyage: "https://voyage.test/v1",
  deepseek: "https://deepseek.test",
  groq: "https://groq.test/openai/v1",
};

function realProviders(logger?: ProviderCallLogger) {
  return createProviderClients({ mode: "real", env, baseUrls, logger });
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function requestUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

function expectPricedUsage(usage: { provider: string; operation: string }): void {
  expect(`${usage.provider}.${usage.operation}` in TOOL_OPERATION_PRICING).toBe(true);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider normalization", () => {
  it("normalizes dates and removes provider HTML", () => {
    expect(normalizeProviderPublishedAt("1728734325")).toBe("2024-10-12T11:58:45.000Z");
    expect(normalizeProviderPublishedAt("Sat Oct 12 11:58:45 +0000 2024")).toBe(
      "2024-10-12T11:58:45.000Z",
    );
    expect(normalizeProviderPublishedAt("not a date")).toBeNull();
    expect(normalizeProviderPublishedAt("999999999999999999")).toBeNull();
    expect(cleanProviderText("<script>secret()</script><b>A &amp; B</b>")).toBe("A & B");
    expect(cleanProviderText("bad: &#9999999999; and &#xFFFFFFFF;")).toBe("bad: � and �");
  });

  it("implements every operation in mock mode without Xquik", async () => {
    const providers = createMockProviderClients();
    expect("xquik" in providers).toBe(false);

    for (const operation of REDDIT_OPERATIONS) {
      const result = await providers.fetchlayer.execute({
        requestId: "ctx_reddit",
        platform: "reddit",
        operation,
      });
      expect(result.data[0]?.platform).toBe("reddit");
      expect(result.usage.billableUnits).toBe(1);
      expectPricedUsage(result.usage);
    }
    for (const operation of X_OPERATIONS) {
      const result = await providers.fetchlayer.execute({
        requestId: "ctx_x",
        platform: "x",
        operation,
      });
      expect(result.data[0]?.platform).toBe("x");
      expect(result.usage.provider).toBe("fetchlayer");
      expectPricedUsage(result.usage);
    }
    for (const operation of API_DIRECT_OPERATIONS) {
      const result = await providers.apiDirect.execute({
        requestId: "ctx_api_direct",
        operation,
      });
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.usage.provider).toBe("api_direct");
      expectPricedUsage(result.usage);
    }
    for (const operation of HACKER_NEWS_OPERATIONS) {
      const result = await providers.hackerNews.execute({
        requestId: "ctx_hn",
        operation,
      });
      expect(result.data[0]?.platform).toBe("hackernews");
      expect(result.usage.billableUnits).toBe(1);
      expectPricedUsage(result.usage);
    }
    for (const operation of GITHUB_OPERATIONS) {
      const result = await providers.github.execute({
        requestId: "ctx_github",
        operation,
      });
      expect(result.data[0]?.provider).toBe("github");
      expect(result.usage.billableUnits).toBe(1);
      expectPricedUsage(result.usage);
    }
  });

  it("does not fail successful calls or leak payloads when logging fails", async () => {
    const logged: unknown[] = [];
    const providers = createMockProviderClients((entry) => {
      logged.push(entry);
      throw new Error("provider_call_logs insert failed");
    });

    const result = await providers.exa.search({
      requestId: "ctx_test",
      query: "secret query",
      platform: "web",
      limit: 1,
    });

    expect(result.data).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain("secret query");
  });

  it("rejects credentialed and literal non-public provider source URLs", async () => {
    const blockedUrls = [
      "https://user:secret@example.com/source",
      "http://localhost/source",
      "http://service.localhost/source",
      "http://127.0.0.1/source",
      "http://10.0.0.1/source",
      "http://100.64.0.1/source",
      "http://169.254.169.254/source",
      "http://172.16.0.1/source",
      "http://192.0.0.1/source",
      "http://192.168.1.1/source",
      "http://198.18.0.1/source",
      "http://198.51.100.1/source",
      "http://203.0.113.1/source",
      "http://224.0.0.1/source",
      "http://[::1]/source",
      "http://[fc00::1]/source",
      "http://[fd00::1]/source",
      "http://[fe80::1]/source",
      "http://[ff02::1]/source",
      "http://[2001:db8::1]/source",
      "http://[2001::1]/source",
      "http://[::ffff:127.0.0.1]/source",
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            ...blockedUrls.map((url, index) => ({
              id: "blocked_" + String(index),
              title: "Blocked",
              url,
              text: "Must not cross the public boundary.",
            })),
            {
              id: "public_1",
              title: "Public",
              url: "https://example.com/source",
              text: "Public source.",
            },
            {
              id: "public_2",
              title: "Public IPv4",
              url: "https://8.8.8.8/source",
              text: "Public source.",
            },
            {
              id: "public_3",
              title: "Public IPv6",
              url: "https://[2606:4700:4700::1111]/source",
              text: "Public source.",
            },
            {
              id: "public_4",
              title: "Public IPv4 outside TEST-NET-2",
              url: "https://198.51.1.1/source",
              text: "Public source.",
            },
            {
              id: "public_5",
              title: "Public IPv4 outside TEST-NET-3",
              url: "https://203.0.1.1/source",
              text: "Public source.",
            },
          ],
        }),
      ),
    );

    const result = await realProviders().exa.search({
      requestId: "ctx_public_urls",
      query: "sources",
      platform: "web",
      limit: 10,
    });

    expect(result.data.map((candidate) => candidate.url)).toEqual([
      "https://example.com/source",
      "https://8.8.8.8/source",
      "https://[2606:4700:4700::1111]/source",
      "https://198.51.1.1/source",
      "https://203.0.1.1/source",
    ]);
  });
});

describe("FetchLayer", () => {
  it("routes both Reddit and X through the unified authenticated API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 42,
              title: "<b>Supacontext discussion</b>",
              permalink: "/r/supacontext/comments/42/discussion/",
              selftext: "Useful &amp; cited context.",
              created_utc: 1_728_734_325,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          tweets: [
            {
              id: "99",
              text: "An X post",
              username: "supacontext",
              created_at: "2026-07-10T10:00:00Z",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const reddit = await providers.fetchlayer.searchReddit({
      requestId: "ctx_reddit",
      query: "Supacontext",
      limit: 1,
    });
    const x = await providers.fetchlayer.searchX({
      requestId: "ctx_x",
      query: "Supacontext",
      limit: 1,
    });

    expect(requestUrl(fetchMock.mock.calls[0]?.[0] as string).pathname).toBe("/api/reddit/search");
    expect(requestUrl(fetchMock.mock.calls[1]?.[0] as string).pathname).toBe("/api/twitter/search");
    for (const call of fetchMock.mock.calls) {
      const headers = new Headers((call[1] as RequestInit | undefined)?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-fetchlayer-key");
    }
    expect(reddit.data[0]).toMatchObject({
      provider: "fetchlayer",
      platform: "reddit",
      url: "https://www.reddit.com/r/supacontext/comments/42/discussion/",
      title: "Supacontext discussion",
      publishedAt: "2024-10-12T11:58:45.000Z",
    });
    expect(reddit.data[0]?.content).toContain("Useful & cited context.");
    expect(reddit.usage).toMatchObject({
      provider: "fetchlayer",
      operation: "reddit.search",
      billableUnits: 1,
    });
    expect(x.data[0]?.url).toBe("https://x.com/supacontext/status/99");
    expect(x.usage.operation).toBe("x.search");
  });

  it("does not retry or bill failed calls", async () => {
    const logs: unknown[] = [];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "down" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders((entry) => logs.push(entry));

    await expect(
      providers.fetchlayer.execute({
        requestId: "ctx_failed",
        platform: "reddit",
        operation: "popular",
      }),
    ).rejects.toMatchObject({ provider: "fetchlayer", statusCode: 503, billableUnits: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logs).toContainEqual(expect.objectContaining({ status: "error", billableUnits: 0 }));
  });
});

describe("API Direct", () => {
  const routes = {
    "facebook.page": "/v1/facebook/page",
    "facebook.page_posts": "/v1/facebook/page/posts",
    "facebook.page_photos": "/v1/facebook/page/photos",
    "facebook.page_videos": "/v1/facebook/page/videos",
    "facebook.page_reels": "/v1/facebook/page/reels",
    "facebook.page_reviews": "/v1/facebook/page/reviews",
    "facebook.group": "/v1/facebook/group",
    "facebook.group_posts": "/v1/facebook/group/posts",
    "facebook.group_search": "/v1/facebook/group/search",
    "facebook.post_comments": "/v1/facebook/post/comments",
    "facebook.search_posts": "/v1/facebook/posts",
    "facebook.search_pages": "/v1/facebook/pages",
    "facebook.search_videos": "/v1/facebook/videos",
    "facebook.search_events": "/v1/facebook/events",
    "facebook.search_locations": "/v1/facebook/locations",
    "youtube.search_videos": "/v1/youtube/posts",
    "youtube.search_channels": "/v1/youtube/channels",
    "youtube.channel": "/v1/youtube/channel",
    "youtube.video": "/v1/youtube/video",
    "youtube.comments": "/v1/youtube/comments",
    "news.search": "/v1/news/articles",
    "forums.search": "/v1/forums/posts",
    "places.search": "/v1/places/search",
    "places.details": "/v1/places/details",
    "places.reviews": "/v1/places/reviews",
    "places.photos": "/v1/places/photos",
    "linkedin.search_posts": "/v1/linkedin/posts",
  } as const;

  it("uses every documented route with server-side X-API-Key authentication", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          results: [
            {
              title: "Result",
              url: "https://source.test/result",
              snippet: "Public context",
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    for (const operation of API_DIRECT_OPERATIONS) {
      await providers.apiDirect.execute({
        requestId: "ctx_routes",
        operation,
        params: { query: "a value & another" },
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(API_DIRECT_OPERATIONS.length);
    API_DIRECT_OPERATIONS.forEach((operation, index) => {
      const call = fetchMock.mock.calls[index];
      const url = requestUrl(call?.[0] as string);
      const headers = new Headers((call?.[1] as RequestInit | undefined)?.headers);
      expect(url.pathname).toBe(routes[operation]);
      expect(url.searchParams.get("query")).toBe("a value & another");
      expect(headers.get("x-api-key")).toBe("test-apidirect-key");
      expect(headers.get("authorization")).toBeNull();
    });
  });

  it("clamps paid pages, disables sentiment, and reports successful page units", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            post_id: "post_1",
            title: "<b>Result</b>",
            url: "https://facebook.test/post/1",
            snippet: "<p>Clean evidence</p>",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const result = await providers.apiDirect.execute({
      requestId: "ctx_pages",
      operation: "facebook.search_posts",
      params: { query: "research", pages: 99, get_sentiment: true },
    });
    const url = requestUrl(fetchMock.mock.calls[0]?.[0] as string);

    expect(url.searchParams.get("pages")).toBe("10");
    expect(url.searchParams.has("get_sentiment")).toBe(false);
    expect(result.usage).toEqual({
      provider: "api_direct",
      operation: "facebook.search-posts",
      billableUnits: 10,
    });
    expect(result.data[0]?.title).toBe("Result");
    expect(result.data[0]?.content).toBe("Clean evidence Result");
    expect(result.data[0]?.summary).toBe("Clean evidence");
  });

  it("reports zero units for a failed API Direct request", async () => {
    const logs: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 400)));
    const providers = realProviders((entry) => logs.push(entry));

    await expect(
      providers.apiDirect.execute({
        requestId: "ctx_bad",
        operation: "places.search",
        params: { query: "coffee", pages: 3 },
      }),
    ).rejects.toMatchObject({ billableUnits: 0, statusCode: 400 });
    expect(logs).toContainEqual(expect.objectContaining({ billableUnits: 0, status: "error" }));
  });

  it("keeps paid photo-only discovery results at the normalized boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          photos: [
            {
              photo_id: "photo_1",
              photo_url: "https://images.test/photo.jpg",
              photo_datetime_utc: "2026-07-01T00:00:00Z",
            },
          ],
        }),
      ),
    );
    const providers = realProviders();

    const result = await providers.apiDirect.execute({
      requestId: "ctx_photo",
      operation: "places.photos",
      params: { place_id: "place_1" },
    });

    expect(result.data[0]).toMatchObject({
      url: "https://images.test/photo.jpg",
      publishedAt: "2026-07-01T00:00:00.000Z",
      content: "places.photos",
    });
  });

  it("preserves Facebook location IDs for the documented two-step search flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            {
              id: "106078429431815",
              label: "London, United Kingdom",
              timezone: "Europe/London",
            },
          ],
        }),
      ),
    );
    const providers = realProviders();

    const result = await providers.apiDirect.execute({
      requestId: "ctx_location",
      operation: "facebook.search_locations",
      params: { query: "London" },
    });

    expect(result.data[0]).toMatchObject({
      title: "London, United Kingdom",
      url: "https://www.facebook.com/106078429431815",
      content: "London, United Kingdom Europe/London",
      metadata: {
        externalId: "106078429431815",
        attributes: { timezone: "Europe/London" },
      },
    });
  });

  it("preserves Facebook detail identifiers needed by follow-up operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          page: {
            page_id: "page_1",
            delegate_page_id: "delegate_1",
            reels_page_id: "reels_1",
            name: "Supacontext",
            url: "https://www.facebook.com/supacontext",
            intro: "Public page",
          },
        }),
      ),
    );
    const providers = realProviders();

    const result = await providers.apiDirect.execute({
      requestId: "ctx_page",
      operation: "facebook.page",
      params: { url: "https://www.facebook.com/supacontext" },
    });

    expect(result.data[0]?.metadata).toMatchObject({
      externalId: "page_1",
      attributes: {
        page_id: "page_1",
        delegate_page_id: "delegate_1",
        reels_page_id: "reels_1",
      },
    });
  });
});

describe("Hacker News and GitHub", () => {
  it("uses Algolia and Firebase for their complementary operations", async () => {
    const logs: unknown[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          hits: [
            {
              objectID: "123",
              title: "HN result",
              story_text: "<p>Useful story</p>",
              created_at: "2026-07-10T00:00:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse([456]));
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders((entry) => logs.push(entry));

    const search = await providers.hackerNews.execute({
      requestId: "ctx_algolia",
      operation: "algolia.search_by_date",
      params: { query: "agents", tags: "story" },
    });
    const feed = await providers.hackerNews.execute({
      requestId: "ctx_firebase",
      operation: "firebase.top",
    });

    expect(requestUrl(fetchMock.mock.calls[0]?.[0] as string).pathname).toBe(
      "/api/v1/search_by_date",
    );
    expect(requestUrl(fetchMock.mock.calls[1]?.[0] as string).pathname).toBe("/v0/topstories.json");
    expect(search.data[0]?.content).toContain("Useful story");
    expect(search.usage).toEqual({
      provider: "hacker_news_algolia",
      operation: "search-by-date",
      billableUnits: 1,
    });
    expect(feed.data[0]?.url).toBe("https://news.ycombinator.com/item?id=456");
    expect(feed.usage.provider).toBe("hacker_news_firebase");
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "hacker_news_algolia" }),
        expect.objectContaining({ provider: "hacker_news_firebase" }),
      ]),
    );
  });

  it("uses the official read-only GitHub API headers and safely encodes paths", async () => {
    const encoded = Buffer.from("# Supacontext\nUseful README content.").toString("base64");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        name: "README.md",
        path: "docs/my file.md",
        html_url: "https://github.com/open-ai/sdk/blob/main/docs/my-file.md",
        encoding: "base64",
        content: encoded,
        sha: "abc",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const result = await providers.github.execute({
      requestId: "ctx_github",
      operation: "repo.contents",
      params: {
        owner: "open ai",
        repo: "sdk",
        path: "docs/my file.md",
        ref: "main",
      },
    });
    const call = fetchMock.mock.calls[0];
    const url = requestUrl(call?.[0] as string);
    const headers = new Headers((call?.[1] as RequestInit | undefined)?.headers);

    expect(url.pathname).toBe("/repos/open%20ai/sdk/contents/docs/my%20file.md");
    expect(url.searchParams.get("ref")).toBe("main");
    expect(headers.get("authorization")).toBe("Bearer test-github-pat");
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(headers.get("x-github-api-version")).toBe("2026-03-10");
    expect(result.data[0]?.content).toContain("Useful README content");
    expect(result.usage).toEqual({
      provider: "github",
      operation: "repository-contents",
      billableUnits: 1,
    });
  });

  it("normalizes GitHub discovery records that have metadata but no prose body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              name: "index.ts",
              path: "src/index.ts",
              html_url: "https://github.com/acme/tool/blob/main/src/index.ts",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          tree: [
            {
              path: "src",
              type: "tree",
              sha: "abc",
              url: "https://api.github.test/tree/abc",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          login: "octocat",
          html_url: "https://github.com/octocat",
          name: "The Octocat",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const code = await providers.github.execute({
      requestId: "ctx_code",
      operation: "search.code",
      params: { q: "language:typescript" },
    });
    const tree = await providers.github.execute({
      requestId: "ctx_tree",
      operation: "repo.tree",
      params: { owner: "acme", repo: "tool", tree_sha: "main" },
    });
    const user = await providers.github.execute({
      requestId: "ctx_user",
      operation: "user",
      params: { username: "octocat" },
    });

    expect(code.data[0]?.content).toBe("index.ts");
    expect(tree.data[0]?.title).toBe("src");
    expect(user.data[0]?.url).toBe("https://github.com/octocat");
    expect(requestUrl(fetchMock.mock.calls[2]?.[0] as string).pathname).toBe("/users/octocat");
  });

  it("does not fabricate a Hacker News user when Firebase returns null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null)));
    const providers = realProviders();

    const result = await providers.hackerNews.execute({
      requestId: "ctx_missing_hn_user",
      operation: "firebase.user",
      params: { username: "missing" },
    });

    expect(result.data).toEqual([]);
    expect(result.usage.billableUnits).toBe(1);
  });

  it("keeps private GitHub records outside the public context boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            full_name: "acme/private",
            html_url: "https://github.com/acme/private",
            description: "must not cross boundary",
            private: true,
          },
          {
            full_name: "acme/public",
            html_url: "https://github.com/acme/public",
            description: "public source",
            private: false,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const result = await providers.github.execute({
      requestId: "ctx_public_github",
      operation: "search.repositories",
      params: { q: "supacontext" },
    });
    const url = requestUrl(fetchMock.mock.calls[0]?.[0] as string);

    expect(url.searchParams.get("q")).toBe("supacontext is:public");
    expect(result.data.map((candidate) => candidate.url)).toEqual([
      "https://github.com/acme/public",
    ]);
  });

  it("rejects GitHub tokens whose classic scopes include private repository access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ login: "octocat", html_url: "https://github.com/octocat" }, 200, {
          "x-oauth-scopes": "repo, user:email",
        }),
      ),
    );
    const providers = realProviders();

    await expect(
      providers.github.execute({
        requestId: "ctx_private_scope",
        operation: "user",
        params: { username: "octocat" },
      }),
    ).rejects.toMatchObject({
      errorCode: "GITHUB_TOKEN_PRIVATE_SCOPE",
      message: GITHUB_TOKEN_REQUIREMENT,
      billableUnits: 1,
    });
  });
});

describe("transcript, rerank, and model providers", () => {
  it("uses Supadata native transcripts, header billing, and millisecond timestamps", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          content: [{ text: "First segment", offset: 1_000, duration: 2_500 }],
          lang: "en",
        },
        200,
        { "x-billable-requests": "3" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const result = await providers.supadata.fetchTranscript({
      requestId: "ctx_transcript",
      url: "https://www.youtube.com/watch?v=video123",
      lang: "en",
    });
    const call = fetchMock.mock.calls[0];
    const url = requestUrl(call?.[0] as string);
    const headers = new Headers((call?.[1] as RequestInit | undefined)?.headers);

    expect(url.pathname).toBe("/v1/transcript");
    expect(url.searchParams.get("mode")).toBe("native");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(headers.get("x-api-key")).toBe("test-supadata-key");
    expect(headers.get("authorization")).toBeNull();
    expect(result.data.metadata?.transcriptSegments).toEqual([
      { text: "First segment", startSeconds: 1, endSeconds: 3.5 },
    ]);
    expect(result.usage.billableUnits).toBe(3);
  });

  it("preserves Supadata billing on transcript-unavailable responses", async () => {
    const logs: unknown[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "Transcript unavailable" }, 206, { "x-billable-requests": "1" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders((entry) => logs.push(entry));

    await expect(
      providers.supadata.fetchTranscript({
        requestId: "ctx_unavailable",
        url: "https://youtu.be/no-captions",
      }),
    ).rejects.toMatchObject({ errorCode: "TRANSCRIPT_EMPTY", billableUnits: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logs).toContainEqual(expect.objectContaining({ status: "error", billableUnits: 1 }));
  });

  it("uses Voyage rerank-2.5 and returns provider-reported total tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ index: 1, relevance_score: 0.98 }],
        usage: { total_tokens: 123 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const result = await providers.voyage.rerank({
      requestId: "ctx_rerank",
      query: "target",
      chunks: [
        { id: "a", text: "first" },
        { id: "b", text: "target" },
      ],
      topK: 1,
    });
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;

    expect(body.model).toBe("rerank-2.5");
    expect(result.data).toEqual({ results: [{ id: "b", score: 0.98 }], totalTokens: 123 });
    expect(result.usage).toMatchObject({ billableUnits: 123, totalTokens: 123 });
  });

  it("fails closed instead of settling a paid Voyage rerank at zero", async () => {
    const logs: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ data: [{ index: 0, relevance_score: 0.9 }], usage: {} })),
    );
    const providers = realProviders((entry) => logs.push(entry));

    await expect(
      providers.voyage.rerank({
        requestId: "ctx_missing_voyage_usage",
        query: "target",
        chunks: [{ id: "a", text: "target evidence" }],
        topK: 1,
      }),
    ).rejects.toMatchObject({
      errorCode: "MISSING_PROVIDER_USAGE",
      billableUnits: expect.any(Number),
      totalTokens: expect.any(Number),
    });
    expect(logs).toContainEqual(
      expect.objectContaining({ status: "error", billableUnits: expect.any(Number) }),
    );
  });

  it("passes DeepSeek effort controls and returns reported token usage", async () => {
    const logs: unknown[] = [];
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"answer":"ok"}' } }],
        usage: {
          prompt_tokens: 101,
          prompt_cache_hit_tokens: 61,
          completion_tokens: 19,
          total_tokens: 120,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders((entry) => logs.push(entry));

    const result = await providers.deepseek.research({
      requestId: "ctx_model",
      query: "research",
      model: DEEPSEEK_MODELS.pro,
      reasoning: "max",
      systemPrompt: "Return structured JSON.",
      userPrompt: "Answer the query.",
      evidence: [],
      maxTokens: 777,
    });
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;

    expect(body).toMatchObject({
      model: "deepseek-v4-pro",
      reasoning_effort: "max",
      thinking: { type: "enabled" },
      response_format: { type: "json_object" },
      max_tokens: 777,
      stream: false,
    });
    expect(result.usage).toMatchObject({
      provider: "deepseek",
      inputTokens: 101,
      cachedInputTokens: 61,
      outputTokens: 19,
      totalTokens: 120,
    });
    expect(logs).toContainEqual(expect.objectContaining({ cachedInputTokens: 61 }));
  });

  it("preserves DeepSeek cache usage when a paid completion has empty output", async () => {
    const logs: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: "" } }],
          usage: {
            prompt_tokens: 80,
            prompt_cache_hit_tokens: 50,
            completion_tokens: 2,
            total_tokens: 82,
          },
        }),
      ),
    );
    const providers = realProviders((entry) => logs.push(entry));

    await expect(
      providers.deepseek.research({
        requestId: "ctx_empty_cached_model",
        query: "research",
        model: DEEPSEEK_MODELS.flash,
        reasoning: "high",
        systemPrompt: "Return JSON.",
        userPrompt: "Answer.",
        evidence: [],
        maxTokens: 64,
      }),
    ).rejects.toMatchObject({
      errorCode: "EMPTY_MODEL_OUTPUT",
      cachedInputTokens: 50,
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        status: "error",
        inputTokens: 80,
        cachedInputTokens: 50,
        outputTokens: 2,
      }),
    );
  });

  it("routes Auto with Groq Qwen and exposes a DeepSeek Flash fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"effort":"high"}' } }],
          usage: {
            prompt_tokens: 40,
            prompt_tokens_details: { cached_tokens: 400 },
            completion_tokens: 5,
            total_tokens: 45,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"effort":"medium"}' } }],
          usage: { prompt_tokens: 50, completion_tokens: 6, total_tokens: 56 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const providers = realProviders();

    const groq = await providers.groq.routeEffort({
      requestId: "ctx_groq",
      query: "Compare several sources",
      maxTokens: 64,
    });
    const fallback = await providers.deepseek.routeEffort({
      requestId: "ctx_deepseek_router",
      query: "Compare several sources",
      maxTokens: 64,
    });
    const groqBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;
    const fallbackBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;

    expect(groqBody.model).toBe(GROQ_ROUTER_MODEL);
    expect(groq.data.effort).toBe("high");
    expect(groq.usage.totalTokens).toBe(45);
    expect(groq.usage.cachedInputTokens).toBeUndefined();
    expect(fallbackBody).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning_effort: "high",
      thinking: { type: "enabled" },
    });
    expect(fallback.data.effort).toBe("medium");
    expect(fallback.usage.totalTokens).toBe(56);
  });

  it("preserves paid router usage when Groq returns invalid structured output", async () => {
    const logs: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: "not json" } }],
          usage: {
            prompt_tokens: 20,
            prompt_tokens_details: { cached_tokens: 7 },
            completion_tokens: 3,
            total_tokens: 23,
          },
        }),
      ),
    );
    const providers = realProviders((entry) => logs.push(entry));

    await expect(
      providers.groq.routeEffort({
        requestId: "ctx_invalid_router",
        query: "route this",
        maxTokens: 32,
      }),
    ).rejects.toMatchObject({
      errorCode: "INVALID_ROUTER_OUTPUT",
      billableUnits: 1,
      inputTokens: 20,
      cachedInputTokens: 7,
      outputTokens: 3,
      totalTokens: 23,
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        status: "error",
        billableUnits: 1,
        inputTokens: 20,
        cachedInputTokens: 7,
        outputTokens: 3,
        totalTokens: 23,
      }),
    );
  });
});

describe("provider construction", () => {
  it("caps Exa search at the ten results covered by the audited base price", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [{ title: "Exa result", url: "https://source.test", text: "Evidence" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await realProviders().exa.search({
      requestId: "ctx_exa_price_cap",
      query: "priced search",
      platform: "web",
      limit: 99,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      numResults: number;
    };
    expect(requestBody.numResults).toBe(10);
  });

  it("selects real and mock keyed providers independently in auto mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ title: "Real Exa", url: "https://source.test", text: "Evidence" }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse([1]));
    vi.stubGlobal("fetch", fetchMock);
    const providers = createProviderClients({
      mode: "auto",
      env: { nodeEnv: "production", exaApiKey: "real-exa-key" },
      baseUrls,
    });

    const exa = await providers.exa.search({
      requestId: "ctx_real",
      query: "real",
      platform: "web",
      limit: 1,
    });
    const apiDirect = await providers.apiDirect.execute({
      requestId: "ctx_mock",
      operation: "news.search",
      params: { query: "mock" },
    });
    const hackerNews = await providers.hackerNews.execute({
      requestId: "ctx_hn_real",
      operation: "firebase.top",
    });

    expect(exa.data[0]?.title).toBe("Real Exa");
    expect(apiDirect.data[0]?.content).toContain("mock");
    expect(hackerNews.data[0]?.metadata?.externalId).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires every keyed credential in explicit real mode", () => {
    expect(() =>
      createProviderClients({
        mode: "real",
        env: { ...env, githubPat: undefined },
        baseUrls,
      }),
    ).toThrow("GITHUB API key must be configured");
  });
});
