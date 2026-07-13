import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@workos-inc/authkit-nextjs", () => ({ signOut: mocks.signOut }));
vi.mock("../../../lib/server/auth", () => ({
  isSameOriginRequest: (request: Request) =>
    request.headers.get("origin") === "https://app.example.test",
}));
vi.mock("../../../lib/server/env", () => ({
  webEnv: { APP_URL: "https://app.example.test" },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

describe("sign out", () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
  });

  it("ends the WorkOS session and returns to Supacontext", async () => {
    const response = await POST(
      new NextRequest("https://app.example.test/auth/sign-out", {
        method: "POST",
        headers: { origin: "https://app.example.test" },
      }),
    );

    expect(mocks.signOut).toHaveBeenCalledWith({ returnTo: "https://app.example.test" });
    expect(response.status).toBe(204);
  });

  it("rejects cross-origin logout CSRF", async () => {
    const response = await POST(
      new NextRequest("https://app.example.test/auth/sign-out", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
