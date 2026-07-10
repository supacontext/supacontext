import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provisionWorkspaceForUser: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  handleAuth: (options: { onSuccess: (input: { user: { id: string } }) => Promise<void> }) =>
    options.onSuccess,
}));
vi.mock("../../lib/server/dashboard", () => ({
  provisionWorkspaceForUser: mocks.provisionWorkspaceForUser,
}));
vi.mock("../../lib/server/env", () => ({
  webEnv: { APP_URL: "https://example.com" },
}));

import { GET } from "./route";

describe("authentication callback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.provisionWorkspaceForUser.mockReset();
  });

  it("logs provisioning failures without failing authentication", async () => {
    const error = new Error("database unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callback = GET as unknown as (input: { user: { id: string } }) => Promise<void>;

    mocks.provisionWorkspaceForUser.mockRejectedValueOnce(error);

    await expect(callback({ user: { id: "user_123" } })).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to provision workspace after authentication.",
      {
        workosUserId: "user_123",
        error,
      },
    );
  });
});
