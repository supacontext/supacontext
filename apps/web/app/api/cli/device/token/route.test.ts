import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redeem: vi.fn() }));

vi.mock("../../../../../lib/server/cli-auth", () => ({
  CliAuthError: class extends Error {},
  redeemCliDeviceAuthorization: mocks.redeem,
}));
vi.mock("../../../../../lib/server/auth", () => ({
  isSameOriginRequest: () => true,
}));

import { POST } from "./route";

function request() {
  return new Request("https://app.example.test/api/cli/device/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ device_code: "high-entropy-device-secret" }),
  });
}

describe("CLI device redemption route", () => {
  beforeEach(() => {
    mocks.redeem.mockReset();
  });

  it.each([
    ["pending", "authorization_pending"],
    ["slow_down", "slow_down"],
    ["denied", "access_denied"],
    ["expired", "expired_token"],
    ["consumed", "consumed_token"],
  ] as const)("returns an explicit %s state", async (status, error) => {
    mocks.redeem.mockResolvedValue(
      status === "pending" || status === "slow_down" ? { status, interval: 5 } : { status },
    );

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("returns only the short-lived credential needed by the CLI", async () => {
    mocks.redeem.mockResolvedValue({
      status: "authorized",
      accessToken: "temporary-credential",
      expiresIn: 600,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(body).toEqual({
      access_token: "temporary-credential",
      token_type: "Bearer",
      expires_in: 600,
    });
    expect(body).not.toHaveProperty("refresh_token");
  });
});
