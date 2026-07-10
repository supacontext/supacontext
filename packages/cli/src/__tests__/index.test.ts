import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../config.js";
import { createApiKey, listApiKeys, pollDeviceAuthentication } from "../device-auth.js";
import { runCli } from "../index.js";

const apiKey = `sk_sc_${"A".repeat(43)}`;
const temporaryDirectories = new Set<string>();

class Capture extends Writable {
  value = "";

  constructor(private readonly onWrite?: (value: string) => void) {
    super();
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    const value = chunk.toString();
    this.value += value;
    this.onWrite?.(value);
    callback();
  }
}

class InteractiveInput extends PassThrough {
  isTTY = true;
  isRaw = false;

  setRawMode(mode: boolean) {
    this.isRaw = mode;
    return this;
  }
}

async function testDependencies(input = "") {
  const directory = await mkdtemp(join(tmpdir(), "supacontext-cli-"));

  temporaryDirectories.add(directory);
  return {
    configPath: join(directory, "config.json"),
    env: {},
    stdin: Readable.from([input]),
    stdout: new Capture(),
    stderr: new Capture(),
    openUrl: vi.fn(async () => true),
    sleep: vi.fn(async () => undefined),
  };
}

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })),
  );
  temporaryDirectories.clear();
});

describe("Supacontext CLI", () => {
  it("saves a key from stdin without printing it", async () => {
    const dependencies = await testDependencies(`${apiKey}\n`);

    await runCli(
      ["auth", "set-key", "--key-stdin", "--profile", "agent", "--json"],
      dependencies,
    );

    const config = await readConfig(dependencies.configPath);
    const output = dependencies.stdout.value + dependencies.stderr.value;

    expect(config.profiles.agent?.api_key).toBe(apiKey);
    expect(output).not.toContain(apiKey);
    expect(JSON.parse(dependencies.stdout.value)).toEqual({
      ok: true,
      profile: "agent",
      configured: true,
    });
  });

  it("updates the active profile when no profile flag is provided", async () => {
    const dependencies = await testDependencies(`${apiKey}\n`);
    const replacement = `sk_sc_${"B".repeat(43)}`;

    await runCli(["auth", "set-key", "--profile", "agent", "--json"], dependencies);
    await runCli(["auth", "set-key", "--json"], {
      ...dependencies,
      stdin: Readable.from([`${replacement}\n`]),
    });

    const config = await readConfig(dependencies.configPath);

    expect(config.active_profile).toBe("agent");
    expect(config.profiles.agent?.api_key).toBe(replacement);
    expect(config.profiles.default).toBeUndefined();
    expect(dependencies.stdout.value).not.toContain(replacement);
  });

  it("runs WorkOS device authorization and stores a newly created key", async () => {
    const dependencies = await testDependencies();
    const accessToken = "workos-access-token";
    let tokenRequests = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url === "https://app.example.test/api/cli/config") {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json({
          api_url: "https://api.example.test",
          workos_client_id: "client_test",
          device_authorization_url: "https://workos.test/device",
          device_token_url: "https://workos.test/token",
        });
      }

      if (url === "https://workos.test/device") {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json({
          device_code: "secret-device-code",
          user_code: "ABCD-EFGH",
          verification_uri: "https://auth.example.test/device",
          verification_uri_complete: "https://auth.example.test/device?user_code=ABCD-EFGH",
          expires_in: 300,
          interval: 1,
        });
      }

      if (url === "https://workos.test/token") {
        tokenRequests += 1;

        if (tokenRequests === 1) {
          return Response.json({ error: "authorization_pending" }, { status: 400 });
        }

        return Response.json({
          access_token: accessToken,
          refresh_token: "unused-refresh-token",
          user: { id: "user_1", email: "agent@example.test" },
        });
      }

      if (url === "https://app.example.test/api/cli/keys" && !init?.method) {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
        return Response.json({ keys: [] });
      }

      if (url === "https://app.example.test/api/cli/keys" && init?.method === "POST") {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
        expect(JSON.parse(String(init.body))).toEqual({
          name: "Agent CLI",
          maxEffort: "high",
          monthlyCreditLimit: 25,
        });
        return Response.json({
          key: {
            id: "key_1",
            name: "Agent CLI",
            prefix: apiKey.slice(0, 16),
            maxEffort: "high",
            monthlyCreditLimit: 25,
            monthToDateCredits: 0,
            lastUsedAt: null,
            revokedAt: null,
            createdAt: "2026-07-10T00:00:00.000Z",
          },
          rawKey: apiKey,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    await runCli(
      [
        "auth",
        "login",
        "--app-url",
        "https://app.example.test",
        "--create-key",
        "Agent CLI",
        "--max-effort",
        "high",
        "--monthly-credit-limit",
        "25",
        "--json",
      ],
      { ...dependencies, fetch: fetchMock },
    );

    const config = await readConfig(dependencies.configPath);
    const allOutput = dependencies.stdout.value + dependencies.stderr.value;

    expect(dependencies.openUrl).toHaveBeenCalledWith(
      "https://auth.example.test/device?user_code=ABCD-EFGH",
    );
    expect(dependencies.sleep).toHaveBeenCalledWith(1_000);
    expect(config.profiles.default?.api_key).toBe(apiKey);
    expect(config.profiles.default?.api_url).toBe("https://api.example.test");
    expect(allOutput).not.toContain(apiKey);
    expect(allOutput).not.toContain(accessToken);
    expect(allOutput).not.toContain("secret-device-code");
    expect(JSON.parse(dependencies.stdout.value)).toMatchObject({
      ok: true,
      profile: "default",
      authenticated: true,
      api_key: { id: "key_1", name: "Agent CLI" },
    });
  });

  it("keeps interactive key selection off stdout in JSON mode", async () => {
    const dependencies = await testDependencies();
    const stdin = new InteractiveInput();
    const stderr = new Capture((value) => {
      if (value === "Select a key: ") {
        queueMicrotask(() => stdin.write("1\n"));
      } else if (value === "Paste this API key: ") {
        queueMicrotask(() => stdin.write(`${apiKey}\n`));
      }
    });
    const key = {
      id: "key_1",
      name: "Existing key",
      prefix: apiKey.slice(0, 16),
      maxEffort: "x_high",
      monthlyCreditLimit: null,
      monthToDateCredits: 0,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-07-10T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "https://app.example.test/api/cli/config") {
        return Response.json({
          api_url: "https://api.example.test",
          workos_client_id: "client_test",
          device_authorization_url: "https://workos.test/device",
          device_token_url: "https://workos.test/token",
        });
      }

      if (url === "https://workos.test/device") {
        return Response.json({
          device_code: "secret-device-code",
          user_code: "ABCD-EFGH",
          verification_uri: "https://auth.example.test/device",
          expires_in: 300,
        });
      }

      if (url === "https://workos.test/token") {
        return Response.json({ access_token: "access-token", user: { id: "user_1" } });
      }

      if (url === "https://app.example.test/api/cli/keys") {
        return Response.json({ keys: [key] });
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    await runCli(
      ["auth", "login", "--app-url", "https://app.example.test", "--no-open", "--json"],
      { ...dependencies, stdin, stderr, fetch: fetchMock },
    );

    expect(JSON.parse(dependencies.stdout.value)).toMatchObject({
      ok: true,
      api_key: { id: "key_1", name: "Existing key" },
    });
    expect(dependencies.stdout.value).not.toContain("Available API keys");
    expect(dependencies.stdout.value).not.toContain("Select a key");
    expect(stderr.value).toContain("Available API keys");
    expect(stderr.value).toContain("Select a key");
  });

  it("expires a device token request that hangs past the authorization deadline", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();

      setTimeout(() => controller.abort(), milliseconds);
      return controller.signal;
    });

    try {
      const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;

          expect(signal).toBeInstanceOf(AbortSignal);
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }) as unknown as typeof fetch;
      const authentication = pollDeviceAuthentication({
        discovery: {
          api_url: "https://api.example.test",
          workos_client_id: "client_test",
          device_authorization_url: "https://workos.test/device",
          device_token_url: "https://workos.test/token",
        },
        authorization: {
          device_code: "secret-device-code",
          user_code: "ABCD-EFGH",
          verification_uri: "https://auth.example.test/device",
          expires_in: 1,
        },
        fetch: fetchMock,
        sleep: vi.fn(async () => undefined),
      });
      const rejection = expect(authentication).rejects.toMatchObject({
        code: "AUTHORIZATION_EXPIRED",
        message: "Browser authorization expired. Try again.",
      });

      await vi.advanceTimersByTimeAsync(1_001);
      await rejection;
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it("rejects malformed API key responses", async () => {
    const malformedKey = {
      id: "key_1",
      name: 42,
      prefix: "sk_sc_example",
    };

    await expect(
      listApiKeys(
        "https://app.example.test",
        "access-token",
        vi.fn(async () => Response.json({ keys: [malformedKey] })) as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED" });

    await expect(
      createApiKey({
        appUrl: "https://app.example.test",
        accessToken: "access-token",
        name: "Agent CLI",
        maxEffort: "high",
        monthlyCreditLimit: null,
        fetch: vi.fn(async () =>
          Response.json({ key: malformedKey, rawKey: apiKey }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED" });
  });

  it("rejects invalid browser verification URLs without opening them", async () => {
    const dependencies = await testDependencies();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "https://app.example.test/api/cli/config") {
        return Response.json({
          api_url: "https://api.example.test",
          workos_client_id: "client_test",
          device_authorization_url: "https://workos.test/device",
          device_token_url: "https://workos.test/token",
        });
      }

      return Response.json({
        device_code: "secret-device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "javascript:alert(1)",
        expires_in: 300,
      });
    }) as unknown as typeof fetch;

    await expect(
      runCli(
        ["auth", "login", "--app-url", "https://app.example.test", "--no-open"],
        { ...dependencies, fetch: fetchMock },
      ),
    ).rejects.toMatchObject({ code: "INVALID_URL" });
    expect(dependencies.openUrl).not.toHaveBeenCalled();
    expect(dependencies.stderr.value).not.toContain("javascript:");
  });

  it("requires a profile name when activating a profile", async () => {
    const dependencies = await testDependencies();

    await expect(runCli(["profile", "use"], dependencies)).rejects.toMatchObject({
      code: "PROFILE_NAME_REQUIRED",
      message: "A profile name is required.",
    });
  });

  it("sends source and depth options and returns structured JSON", async () => {
    const dependencies = await testDependencies(`${apiKey}\n`);

    await runCli(["auth", "set-key", "--json"], dependencies);
    dependencies.stdout.value = "";

    const responseBody = {
      id: "ctx_1",
      query: "agent context",
      effort: "x_high",
      status: "completed",
      answer: "Cited answer",
      context_pack: [{ fact: "value", citation_ids: ["src_1"] }],
      sources: [{ id: "src_1", url: "https://example.test" }],
      gaps: [],
      usage: {
        credits_charged: 2,
        credits_reserved: 0,
        effort: "x_high",
        platforms_used: ["web", "hackernews"],
        sources_considered: 3,
        sources_used: 1,
        cached: false,
      },
    };
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
      expect(JSON.parse(String(init?.body))).toEqual({
        query: "agent context",
        effort: "x_high",
        max_credits: 10,
        platforms: ["web", "hackernews"],
        metadata: { consumer: "agent" },
      });
      return Response.json(responseBody);
    }) as unknown as typeof fetch;

    await runCli(
      [
        "context",
        "create",
        "agent context",
        "--depth",
        "x-high",
        "--source",
        "web,hacker-news",
        "--max-credits",
        "10",
        "--metadata",
        '{"consumer":"agent"}',
        "--json",
      ],
      { ...dependencies, stdin: Readable.from([]), fetch: fetchMock },
    );

    expect(JSON.parse(dependencies.stdout.value)).toEqual(responseBody);
  });

  it("lets agents explicitly choose synchronous or asynchronous execution", async () => {
    const dependencies = await testDependencies(`${apiKey}\n`);

    await runCli(["auth", "set-key", "--json"], dependencies);
    dependencies.stdout.value = "";

    const requestBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      requestBodies.push(body);
      return body.async
        ? Response.json({ id: "ctx_async", status: "queued", credits_reserved: 5 })
        : Response.json({
            id: "ctx_sync",
            query: body.query,
            effort: "medium",
            status: "completed",
            answer: "Done",
            context_pack: [],
            sources: [],
            gaps: [],
            usage: {
              credits_charged: 1,
              credits_reserved: 0,
              effort: "medium",
              platforms_used: [],
              sources_considered: 0,
              sources_used: 0,
              cached: false,
            },
          });
    }) as unknown as typeof fetch;

    await runCli(["context", "create", "sync query", "--sync", "--json"], {
      ...dependencies,
      stdin: Readable.from([]),
      fetch: fetchMock,
    });
    await runCli(["context", "create", "async query", "--async", "--json"], {
      ...dependencies,
      stdin: Readable.from([]),
      fetch: fetchMock,
    });

    expect(requestBodies).toEqual([
      { query: "sync query", async: false },
      { query: "async query", async: true },
    ]);
    expect(
      dependencies.stdout.value
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toMatchObject([
      { id: "ctx_sync", status: "completed" },
      { id: "ctx_async", status: "queued" },
    ]);
  });

  it("rejects contradictory execution modes before making a request", async () => {
    const dependencies = await testDependencies(`${apiKey}\n`);
    const fetchMock = vi.fn();

    await runCli(["auth", "set-key", "--json"], dependencies);

    for (const flags of [
      ["--sync", "--async"],
      ["--sync", "--wait"],
    ]) {
      await expect(
        runCli(["context", "create", "agent context", ...flags], {
          ...dependencies,
          stdin: Readable.from([]),
          fetch: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: "CONFLICTING_OPTIONS" });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS webhook URLs before making a request", async () => {
    const dependencies = await testDependencies(`${apiKey}\n`);
    const fetchMock = vi.fn();

    await runCli(["auth", "set-key", "--json"], dependencies);

    await expect(
      runCli(
        ["context", "create", "agent context", "--webhook-url", "http://example.test/webhook"],
        { ...dependencies, stdin: Readable.from([]), fetch: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: "INVALID_URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
