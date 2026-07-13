import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateOAuthCode: vi.fn(),
  provisionWorkspaceForUser: vi.fn(),
  readOAuthFlow: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({ saveSession: mocks.saveSession }));
vi.mock("../../../lib/server/auth", () => ({
  authFlowCookieName: () => "sc-auth-flow-test",
  authFlowCookieOptions: () => ({ httpOnly: true, path: "/auth/callback", sameSite: "lax" }),
  authRetryPath: (flow: { intent?: string } | null, error: string) =>
    `${flow?.intent === "sign-up" ? "/sign-up" : "/sign-in"}?error=${error}`,
  authenticateOAuthCode: mocks.authenticateOAuthCode,
  readOAuthFlow: mocks.readOAuthFlow,
}));
vi.mock("../../../lib/server/dashboard", () => ({
  provisionWorkspaceForUser: mocks.provisionWorkspaceForUser,
}));
vi.mock("../../../lib/server/env", () => ({
  webEnv: { APP_URL: "https://app.example.test" },
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const flow = {
  state: "state_123",
  codeVerifier: "verifier_123",
  provider: "google",
  returnPath: "/keys?welcome=1",
  intent: "sign-in",
};
const authentication = {
  accessToken: "server-only-access-token",
  refreshToken: "server-only-refresh-token",
  authenticationMethod: "GoogleOAuth",
  user: { id: "user_123", email: "person@example.test" },
};

describe("custom OAuth callback", () => {
  beforeEach(() => {
    mocks.authenticateOAuthCode.mockReset();
    mocks.provisionWorkspaceForUser.mockReset();
    mocks.readOAuthFlow.mockReset();
    mocks.saveSession.mockReset();
    mocks.readOAuthFlow.mockResolvedValue(flow);
    mocks.authenticateOAuthCode.mockResolvedValue(authentication);
  });

  it("validates the flow, provisions idempotently, saves the session, and returns safely", async () => {
    const request = new NextRequest(
      "https://app.example.test/auth/callback?code=authorization-code&state=state_123",
    );
    const response = await GET(request);

    expect(mocks.authenticateOAuthCode).toHaveBeenCalledWith({
      code: "authorization-code",
      flow,
      request,
    });
    expect(mocks.provisionWorkspaceForUser).toHaveBeenCalledWith(authentication.user);
    expect(mocks.saveSession).toHaveBeenCalledWith(authentication, request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/keys?welcome=1");
    expect(response.headers.get("set-cookie")).toContain("sc-auth-flow-test=");
  });

  it("handles provider denial without exchanging a code", async () => {
    const response = await GET(
      new NextRequest("https://app.example.test/auth/callback?error=access_denied&state=state_123"),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/sign-in?error=access_denied",
    );
    expect(mocks.authenticateOAuthCode).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
  });

  it("rejects missing or expired state", async () => {
    mocks.readOAuthFlow.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("https://app.example.test/auth/callback?code=authorization-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/sign-in?error=invalid_session",
    );
    expect(mocks.authenticateOAuthCode).not.toHaveBeenCalled();
  });

  it("shows a safe retry when session creation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.saveSession.mockRejectedValueOnce(new Error("cookie failure"));

    const response = await GET(
      new NextRequest(
        "https://app.example.test/auth/callback?code=authorization-code&state=state_123",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/sign-in?error=session_failed",
    );
  });
});
