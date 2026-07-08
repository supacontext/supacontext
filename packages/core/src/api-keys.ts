import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "sk_sc_";
const API_KEY_RANDOM_BYTES = 32;
const API_KEY_DISPLAY_PREFIX_LENGTH = 16;
const MIN_HASH_SECRET_LENGTH = 32;

export type ApiKeyMaterial = {
  rawKey: string;
  prefix: string;
  hash: string;
};

type RandomBytes = (size: number) => Buffer;

function assertHashSecret(secret: string): void {
  if (secret.length < MIN_HASH_SECRET_LENGTH) {
    throw new Error(`API key hash secret must be at least ${MIN_HASH_SECRET_LENGTH} characters.`);
  }
}

export function hashApiKey(rawKey: string, secret: string): string {
  assertHashSecret(secret);

  return createHmac("sha256", secret).update(rawKey).digest("hex");
}

export function getApiKeyDisplayPrefix(rawKey: string): string {
  return rawKey.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

export function createApiKeyMaterial(
  secret: string,
  randomBytesFn: RandomBytes = randomBytes,
): ApiKeyMaterial {
  const token = randomBytesFn(API_KEY_RANDOM_BYTES).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${token}`;

  return {
    rawKey,
    prefix: getApiKeyDisplayPrefix(rawKey),
    hash: hashApiKey(rawKey, secret),
  };
}

export function verifyApiKey(rawKey: string, storedHash: string, secret: string): boolean {
  const candidateHash = hashApiKey(rawKey, secret);
  const candidate = Buffer.from(candidateHash, "hex");
  const stored = Buffer.from(storedHash, "hex");

  if (candidate.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(candidate, stored);
}
