import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("../../../../../lib/server/auth", () => ({ isSameOriginRequest: () => true }));
vi.mock("../../../../../lib/server/cli-auth", () => ({
  CliAuthError: class extends Error {},
  decideCliDeviceAuthorization: mocks.decide,
}));
vi.mock("../../../../../lib/server/dashboard", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("../../../../../lib/server/env", () => ({
  webEnv: { APP_URL: "https://app.example.test" },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

function request() {
  return new NextRequest("https://app.example.test/api/cli/device/decision", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://app.example.test",
    },
    body: new URLSearchParams({ user_code: "ABCD-EFGH-JKLMN", decision: "approve" }),
  });
}

describe("authenticated CLI approval", () => {
  beforeEach(() => {
    mocks.decide.mockReset();
    mocks.getWorkspaceContext.mockReset();
  });

  it("requires a Supacontext browser session", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/sign-in?returnTo=%2Fcli%2Fauthorize%3Fuser_code%3DABCD-EFGH-JKLMN",
    );
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("binds approval to the authenticated profile", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({ profileId: "profile_123" });
    mocks.decide.mockResolvedValue("approved");

    const response = await POST(request());

    expect(mocks.decide).toHaveBeenCalledWith({
      profileId: "profile_123",
      userCode: "ABCD-EFGH-JKLMN",
      decision: "approve",
    });
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/cli/authorize?result=approved",
    );
  });
});
