import { describe, expect, it } from "vitest";
import { createApiKeyMaterial, hashApiKey, verifyApiKey } from "../api-keys.js";

const secret = "test-secret-with-at-least-32-characters";

describe("API key hashing", () => {
  it("stores a hash and display prefix without exposing the raw key", () => {
    const key = createApiKeyMaterial(secret, () => Buffer.alloc(32, 1));

    expect(key.rawKey.startsWith("sk_sc_")).toBe(true);
    expect(key.prefix).toBe(key.rawKey.slice(0, 16));
    expect(key.hash).toBe(hashApiKey(key.rawKey, secret));
    expect(key.hash).not.toContain(key.rawKey);
  });

  it("verifies matching keys with a timing-safe comparison", () => {
    const key = createApiKeyMaterial(secret, () => Buffer.alloc(32, 2));

    expect(verifyApiKey(key.rawKey, key.hash, secret)).toBe(true);
    expect(verifyApiKey(`${key.rawKey}x`, key.hash, secret)).toBe(false);
  });

  it("requires a strong hash secret", () => {
    expect(() => createApiKeyMaterial("short")).toThrow("at least 32 characters");
  });
});

