import { describe, expect, it } from "vitest";
import { SupaContext } from "../index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("SupaContext SDK", () => {
  it("creates context requests with auth and idempotency headers", async () => {
    const calls: Request[] = [];
    const client = new SupaContext({
      apiKey: "sk_sc_test",
      baseUrl: "https://api.example.test",
      fetch: async (input, init) => {
        calls.push(new Request(input, init));

        return jsonResponse({
          id: "ctx_1",
          status: "queued",
          credits_charged: 20,
        });
      },
    });

    const response = await client.context.create(
      {
        query: "agent context APIs",
        async: true,
      },
      {
        idempotencyKey: "idem_1",
      },
    );

    expect(response).toEqual({
      id: "ctx_1",
      status: "queued",
      credits_charged: 20,
    });
    expect(calls[0]?.url).toBe("https://api.example.test/v1/context");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk_sc_test");
    expect(calls[0]?.headers.get("idempotency-key")).toBe("idem_1");
  });

  it("polls until a request reaches a terminal status", async () => {
    let calls = 0;
    const client = new SupaContext({
      apiKey: "sk_sc_test",
      baseUrl: "https://api.example.test",
      fetch: async () => {
        calls += 1;

        return jsonResponse({
          id: "ctx_1",
          query: "agent context APIs",
          depth: "standard",
          status: calls === 1 ? "running" : "completed",
          answer: calls === 1 ? null : "Done",
          context_pack: [],
          sources: [],
          gaps: [],
          usage: {
            credits_charged: 20,
            depth: "standard",
            platforms_used: ["web"],
            sources_considered: 0,
            sources_used: 0,
            cached: false,
          },
        });
      },
    });

    const response = await client.context.poll("ctx_1", {
      intervalMs: 1,
      timeoutMs: 100,
    });

    expect(calls).toBe(2);
    expect(response.status).toBe("completed");
  });

  it("throws typed API errors", async () => {
    const client = new SupaContext({
      apiKey: "sk_sc_test",
      baseUrl: "https://api.example.test",
      fetch: async () =>
        jsonResponse(
          {
            error: {
              code: "insufficient_credits",
              message: "Insufficient account credits.",
            },
          },
          402,
        ),
    });

    await expect(client.context.get("ctx_1")).rejects.toMatchObject({
      status: 402,
      code: "insufficient_credits",
    });
  });
});
