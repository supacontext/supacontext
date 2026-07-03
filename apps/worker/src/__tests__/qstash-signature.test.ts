import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInternalToken, verifyQstashSignature } from "../qstash-signature.js";

function jwt(payload: object, key: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(`${header}.${body}`).digest("base64url");

  return `${header}.${body}.${signature}`;
}

describe("worker request authentication", () => {
  it("verifies QStash JWT signatures and time claims", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const signature = jwt(
      {
        nbf: Math.floor(now.getTime() / 1000) - 10,
        exp: Math.floor(now.getTime() / 1000) + 10,
      },
      "signing_key",
    );

    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "signing_key",
        nextSigningKey: undefined,
        now,
      }),
    ).toBe(true);
    expect(
      verifyQstashSignature({
        signature,
        currentSigningKey: "wrong_key",
        nextSigningKey: undefined,
        now,
      }),
    ).toBe(false);
  });

  it("verifies internal worker tokens with timing-safe comparison", () => {
    expect(verifyInternalToken({ candidate: "token", expected: "token" })).toBe(true);
    expect(verifyInternalToken({ candidate: "token", expected: "other" })).toBe(false);
  });
});
