import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizationUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    userManagement = {
      authenticateWithCode: vi.fn(),
      getAuthorizationUrl: mocks.getAuthorizationUrl,
    };
  },
}));
vi.mock("../env", () => ({
  webEnv: {
    APP_URL: "https://app.example.test",
    WORKOS_API_KEY: "sk_test_example",
    WORKOS_CLIENT_ID: "client_example",
    WORKOS_COOKIE_PASSWORD: "a-secure-cookie-password-with-32-characters",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://app.example.test/auth/callback",
  },
}));

import { NextRequest } from "next/server";
import { createOAuthFlow, isSameOriginRequest, normalizeReturnPath, readOAuthFlow } from "../auth";

describe("custom OAuth flow security", () => {
  beforeEach(() => {
    mocks.getAuthorizationUrl.mockReset();
    mocks.getAuthorizationUrl.mockImplementation(
      (options: { provider: string; state: string; codeChallenge: string }) =>
        `https://api.workos.com/user_management/authorize?provider=${options.provider}&state=${options.state}&code_challenge=${options.codeChallenge}`,
    );
  });

  it("accepts same-origin and relative returns and rejects open redirects", () => {
    expect(normalizeReturnPath("/keys?created=1")).toBe("/keys?created=1");
    expect(normalizeReturnPath("https://app.example.test/usage")).toBe("/usage");
    expect(normalizeReturnPath("https://evil.example/steal")).toBe("/dashboard");
    expect(normalizeReturnPath("//evil.example/steal")).toBe("/dashboard");
    expect(normalizeReturnPath("/\\evil.example")).toBe("/dashboard");
    expect(normalizeReturnPath("/auth/callback?next=https://evil.example")).toBe("/dashboard");
  });

  it("creates provider-specific PKCE state and rejects a missing flow cookie", async () => {
    const flow = await createOAuthFlow({
      provider: "google",
      returnTo: "/dashboard",
      intent: "sign-in",
    });
    const authorizationUrl = new URL(flow.url);
    const state = authorizationUrl.searchParams.get("state");

    expect(mocks.getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "GoogleOAuth",
        codeChallengeMethod: "S256",
        redirectUri: "https://app.example.test/auth/callback",
      }),
    );
    expect(state).toHaveLength(43);
    expect(authorizationUrl.searchParams.get("code_challenge")).toHaveLength(43);

    const validRequest = new NextRequest(`https://app.example.test/auth/callback?state=${state}`, {
      headers: { cookie: `${flow.cookieName}=${flow.cookieValue}` },
    });
    const missingCookieRequest = new NextRequest(
      `https://app.example.test/auth/callback?state=${state}`,
    );

    await expect(readOAuthFlow(validRequest, state!)).resolves.toMatchObject({
      provider: "google",
      returnPath: "/dashboard",
    });
    await expect(readOAuthFlow(missingCookieRequest, state!)).resolves.toBeNull();
  });

  it("requires same-origin browser posts", () => {
    expect(
      isSameOriginRequest(
        new Request("https://app.example.test/auth/oauth/google", {
          headers: { origin: "https://app.example.test" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://app.example.test/auth/oauth/google", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
  });
});
