import { hashApiKey, verifyApiKey } from "@supacontext/core";
import type { ApiKeyRow } from "@supacontext/db";
import { ApiError } from "./errors.js";

export type ApiKeyStore = {
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null>;
  markApiKeyUsed(apiKeyId: string): Promise<void>;
};

function readBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new ApiError(401, "AUTH_REQUIRED", "Missing Authorization bearer token.");
  }

  const [scheme, token, extra] = authorization.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extra) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authorization must use Bearer authentication.");
  }

  return token;
}

export async function authenticateApiKey(input: {
  authorization: string | undefined;
  hashSecret: string;
  store: ApiKeyStore;
}): Promise<ApiKeyRow> {
  const rawKey = readBearerToken(input.authorization);
  const keyHash = hashApiKey(rawKey, input.hashSecret);
  const apiKey = await input.store.findApiKeyByHash(keyHash);

  if (!apiKey || !verifyApiKey(rawKey, apiKey.key_hash, input.hashSecret)) {
    throw new ApiError(401, "INVALID_API_KEY", "Invalid API key.");
  }

  await input.store.markApiKeyUsed(apiKey.id);

  return apiKey;
}
