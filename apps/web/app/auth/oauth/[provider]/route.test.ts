import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOAuthFlow: vi.fn(),
}));

vi.mock("../../../../lib/server/auth", () => ({
  authFlowCookieOptions: () => ({ httpOnly: true, path: "/auth/callback", sameSite: "lax" }),
  createOAuthFlow: mocks.createOAuthFlow,
  isOAuthProvider: (value: string) => value === "google" || value === "github",
  isSameOriginRequest: (request: Request) =>
    request.headers.get("origin") === "https://app.example.test",
}));
vi.mock("../../../../lib/server/env", () => ({
  webEnv: { APP_URL: "https://app.example.test" },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

describe("provider OAuth initiation", () => {
  beforeEach(() => {
    mocks.createOAuthFlow.mockReset();
    mocks.createOAuthFlow.mockResolvedValue({
      cookieName: "sc-auth-flow-test",
      cookieValue: "sealed-flow",
      url: "https://api.workos.com/user_management/authorize?provider=direct",
    });
  });

  it.each(["google", "github"])(
    "starts the %s flow from an app-owned POST route",
    async (provider) => {
      const request = new NextRequest(`https://app.example.test/auth/oauth/${provider}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://app.example.test",
        },
        body: new URLSearchParams({ intent: "sign-in", returnTo: "/keys" }),
      });
      const response = await POST(request, { params: Promise.resolve({ provider }) });

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toContain(
        "api.workos.com/user_management/authorize",
      );
      expect(response.headers.get("set-cookie")).toContain("sc-auth-flow-test=sealed-flow");
      expect(mocks.createOAuthFlow).toHaveBeenCalledWith({
        provider,
        intent: "sign-in",
        returnTo: "/keys",
      });
    },
  );

  it("rejects cross-origin initiation", async () => {
    const request = new NextRequest("https://app.example.test/auth/oauth/google", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    const response = await POST(request, { params: Promise.resolve({ provider: "google" }) });

    expect(response.status).toBe(403);
    expect(mocks.createOAuthFlow).not.toHaveBeenCalled();
  });
});
