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

  it("returns one workspace when the same user is provisioned concurrently", async () => {
    let workspaceId: string | null = null;
    let workspaceCreateCount = 0;
    let lookupCount = 0;
    let releaseLookups = () => {};
    const concurrentLookups = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const transaction = Object.assign(
      vi.fn(async (strings: TemplateStringsArray) => {
        const query = queryText(strings);

        if (query.startsWith("insert into profiles")) {
          return [{ id: "profile_123" }];
        }

        if (query.startsWith("insert into workspaces")) {
          if (workspaceId) {
            if (!query.includes("on conflict (owner_profile_id) do update")) {
              throw new Error("duplicate workspace");
            }

            return [{ id: workspaceId }];
          }

          workspaceId = "workspace_123";
          workspaceCreateCount += 1;
          return [{ id: workspaceId }];
        }

        return [];
      }),
      { json: (value: unknown) => value },
    );
    const sql = Object.assign(
      vi.fn(async (strings: TemplateStringsArray) => {
        if (queryText(strings).startsWith("select profiles.id as profile_id")) {
          lookupCount += 1;

          if (lookupCount === 2) {
            releaseLookups();
          }

          await concurrentLookups;
        }

        return [];
      }),
      {
        begin: async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      },
    );

    mocks.createDatabaseClient.mockReturnValue(sql);

    const user = {
      id: "user_123",
      email: "person@example.com",
      firstName: "Person",
      lastName: "Example",
    } as never;
    const [first, second] = await Promise.all([
      provisionWorkspaceForUser(user),
      provisionWorkspaceForUser(user),
    ]);

    expect(first).toMatchObject({
      profileId: "profile_123",
      workspaceId: "workspace_123",
      workosUserId: "user_123",
    });
    expect(second).toEqual(first);
    expect(workspaceCreateCount).toBe(1);
    expect(
      transaction.mock.calls.filter(([strings]) =>
        queryText(strings).startsWith("insert into workspaces"),
      ),
    ).toHaveLength(2);
  });
});
