import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInternalToken, verifyQstashSignature } from "../qstash-signature.js";

function jwt(payload: object, key: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(`${header}.${body}`).digest("base64url");

  return `${header}.${body}.${signature}`;
}

function qstashClaims(input: { body: string; url: string; now: Date }): object {
  return {
    iss: "Upstash",
    sub: input.url,
    nbf: Math.floor(input.now.getTime() / 1000) - 10,
    exp: Math.floor(input.now.getTime() / 1000) + 10,
    body: createHash("sha256").update(input.body).digest("base64url"),
  };
}

describe("worker request authentication", () => {
  it("verifies QStash JWT signatures, endpoint, body hash, and time claims", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const body = JSON.stringify({ requestId: "ctx_test" });
    const url = "https://worker.example.com/v1/jobs/context";
    const signature = jwt(qstashClaims({ body, url, now }), "signing_key");

    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "signing_key",
        nextSigningKey: undefined,
        body,
        url,
        now,
      }),
    ).toBe(true);
    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "wrong_key",
        nextSigningKey: undefined,
        body,
        url,
        now,
      }),
    ).toBe(false);
    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "signing_key",
        nextSigningKey: undefined,
        body: JSON.stringify({ requestId: "ctx_other" }),
        url,
        now,
      }),
    ).toBe(false);
    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "signing_key",
        nextSigningKey: undefined,
        body,
        url: "https://worker.example.com/v1/jobs/other",
        now,
      }),
    ).toBe(false);
  });

  it("rejects QStash tokens without required time claims", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const body = JSON.stringify({ requestId: "ctx_test" });
    const url = "https://worker.example.com/v1/jobs/context";
    const signature = jwt(
      {
        iss: "Upstash",
        sub: url,
        body: createHash("sha256").update(body).digest("base64url"),
      },
      "signing_key",
    );

    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "signing_key",
        nextSigningKey: undefined,
        body,
        url,
        now,
      }),
    ).toBe(false);
  });

  it("verifies internal worker tokens with timing-safe comparison", () => {
    expect(verifyInternalToken({ candidate: "token", expected: "token" })).toBe(true);
    expect(verifyInternalToken({ candidate: "token", expected: "other" })).toBe(false);
  });
});
