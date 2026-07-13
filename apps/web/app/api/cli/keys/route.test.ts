import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokeCliCredential: vi.fn(),
}));

vi.mock("../../../../lib/server/cli-auth", () => ({
  getCliWorkspaceContext: vi.fn(),
  revokeCliCredential: mocks.revokeCliCredential,
}));
vi.mock("../../../../lib/server/dashboard", () => ({
  DashboardError: class extends Error {},
  createDashboardApiKey: vi.fn(),
  listApiKeys: vi.fn(),
}));

import { DELETE } from "./route";

describe("CLI credential revocation route", () => {
  beforeEach(() => {
    mocks.revokeCliCredential.mockReset();
  });

  it("returns no content after successful revocation", async () => {
    mocks.revokeCliCredential.mockResolvedValue(true);

    const response = await DELETE(new Request("https://app.example.test/api/cli/keys"));

    expect(response.status).toBe(204);
  });

  it("rejects an unauthorized revocation", async () => {
    mocks.revokeCliCredential.mockResolvedValue(false);

    const response = await DELETE(new Request("https://app.example.test/api/cli/keys"));

    expect(response.status).toBe(401);
  });

  it("returns a structured error when revocation fails", async () => {
    const error = new Error("database unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.revokeCliCredential.mockRejectedValue(error);

    try {
      const response = await DELETE(new Request("https://app.example.test/api/cli/keys"));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
      expect(consoleError).toHaveBeenCalledWith(error);
    } finally {
      consoleError.mockRestore();
    }
  });
});
