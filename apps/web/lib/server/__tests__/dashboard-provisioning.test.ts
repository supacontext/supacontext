import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDatabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supacontext/db", () => ({
  createDatabaseClient: mocks.createDatabaseClient,
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("../billing", () => ({
  createCreemCheckout: vi.fn(),
  createCreemPortal: vi.fn(),
}));
vi.mock("../env", () => ({
  webEnv: { DATABASE_URL: "postgres://example.test/supacontext" },
}));

import { provisionWorkspaceForUser } from "../dashboard";

function queryText(strings: TemplateStringsArray): string {
  return strings.join("?").replace(/\s+/g, " ").trim();
}

describe("workspace provisioning", () => {
  beforeEach(() => {
    mocks.createDatabaseClient.mockReset();
  });

  it("gets or creates the workspace with one conflict-safe statement", async () => {
    const transaction = Object.assign(
      vi.fn(async (strings: TemplateStringsArray) => {
        const query = queryText(strings);

        if (query.startsWith("insert into profiles")) {
          return [{ id: "profile_123" }];
        }

        if (query.startsWith("insert into workspaces")) {
          return [{ id: "workspace_123" }];
        }

        return [];
      }),
      { json: (value: unknown) => value },
    );
    const sql = Object.assign(
      vi.fn(async () => []),
      {
        begin: async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      },
    );

    mocks.createDatabaseClient.mockReturnValue(sql);

    await expect(
      provisionWorkspaceForUser({
        id: "user_123",
        email: "person@example.com",
        firstName: "Person",
        lastName: "Example",
      } as never),
    ).resolves.toMatchObject({
      profileId: "profile_123",
      workspaceId: "workspace_123",
      workosUserId: "user_123",
    });

    const workspaceCall = transaction.mock.calls.find(([strings]) =>
      queryText(strings).startsWith("insert into workspaces"),
    );

    expect(workspaceCall).toBeDefined();
    expect(queryText(workspaceCall![0])).toContain(
      "on conflict (owner_profile_id) do update set owner_profile_id = excluded.owner_profile_id returning id",
    );
  });
});
