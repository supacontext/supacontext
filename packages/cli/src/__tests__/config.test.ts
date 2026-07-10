import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfigPath, readConfig, resolveProfile, saveProfile } from "../config.js";

const apiKey = `sk_sc_${"A".repeat(43)}`;
const temporaryDirectories = new Set<string>();

async function testConfigPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "supacontext-cli-"));

  temporaryDirectories.add(directory);
  return join(directory, "config.json");
}

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })),
  );
  temporaryDirectories.clear();
});

describe("CLI configuration", () => {
  it("uses conventional per-user configuration paths", () => {
    expect(
      getConfigPath({ APPDATA: "C:\\Users\\dev\\AppData\\Roaming" }, "win32", "C:\\Users\\dev"),
    ).toBe("C:\\Users\\dev\\AppData\\Roaming\\supacontext\\config.json");
    expect(getConfigPath({}, "darwin", "/Users/dev")).toBe(
      "/Users/dev/Library/Application Support/supacontext/config.json",
    );
    expect(getConfigPath({ XDG_CONFIG_HOME: "/config" }, "linux", "/home/dev")).toBe(
      "/config/supacontext/config.json",
    );
  });

  it("stores a selected profile without changing the secret", async () => {
    const path = await testConfigPath();

    await saveProfile(
      "agent",
      {
        api_key: apiKey,
        api_url: "https://api.example.test",
        app_url: "https://example.test",
      },
      path,
    );

    const config = await readConfig(path);

    expect(config.active_profile).toBe("agent");
    expect(config.profiles.agent?.api_key).toBe(apiKey);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(config);

    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("prefers environment values over the stored profile", async () => {
    const path = await testConfigPath();

    await saveProfile(
      "agent",
      {
        api_key: apiKey,
        api_url: "https://stored-api.example.test",
        app_url: "https://stored-app.example.test",
      },
      path,
    );

    await expect(
      resolveProfile({
        env: {
          SUPACONTEXT_API_KEY: `sk_sc_${"B".repeat(43)}`,
          SUPACONTEXT_API_URL: "https://env-api.example.test",
          SUPACONTEXT_APP_URL: "https://env-app.example.test",
        },
        path,
      }),
    ).resolves.toEqual({
      name: "agent",
      apiKey: `sk_sc_${"B".repeat(43)}`,
      apiUrl: "https://env-api.example.test",
      appUrl: "https://env-app.example.test",
      credentialSource: "environment",
    });
  });

  it("falls back to the selected stored profile", async () => {
    const path = await testConfigPath();

    await saveProfile(
      "agent",
      {
        api_key: apiKey,
        api_url: "https://api.example.test",
        app_url: "https://app.example.test",
      },
      path,
    );

    await expect(resolveProfile({ env: {}, path })).resolves.toEqual({
      name: "agent",
      apiKey,
      apiUrl: "https://api.example.test",
      appUrl: "https://app.example.test",
      credentialSource: "config",
    });
  });

  it("normalizes resolved profile URLs", async () => {
    const path = await testConfigPath();

    await saveProfile(
      "agent",
      {
        api_key: apiKey,
        api_url: "https://api.example.test/",
        app_url: "https://app.example.test/",
      },
      path,
    );

    await expect(resolveProfile({ env: {}, path })).resolves.toMatchObject({
      apiUrl: "https://api.example.test",
      appUrl: "https://app.example.test",
    });
  });
});
