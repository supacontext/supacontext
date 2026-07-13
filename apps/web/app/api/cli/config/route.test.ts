import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/server/env", () => ({
  webEnv: {
    APP_URL: "https://app.example.test/",
    API_URL: "https://api.example.test/",
  },
}));

import { GET } from "./route";

describe("CLI discovery", () => {
  it("publishes only Supacontext-owned device endpoints", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      api_url: "https://api.example.test",
      device_authorization_url: "https://app.example.test/api/cli/device/start",
      device_token_url: "https://app.example.test/api/cli/device/token",
    });
  });
});
