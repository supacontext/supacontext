import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getConfigPath, readConfig, saveProfile } from "../config.js";

const apiKey = `sk_sc_${"A".repeat(43)}`;

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
    const directory = await mkdtemp(join(tmpdir(), "supacontext-cli-"));
    const path = join(directory, "config.json");

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
});
