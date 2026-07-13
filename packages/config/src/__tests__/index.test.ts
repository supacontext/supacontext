import { describe, expect, it } from "vitest";
import { webEnvSchema } from "../index.js";

const baseEnvironment = {
  NODE_ENV: "development",
  APP_URL: "https://app.example.test",
  API_URL: "https://api.example.test",
  WORKER_URL: "https://worker.example.test",
  DATABASE_URL: "postgres://example.test/supacontext",
  API_KEY_HASH_SECRET: "a".repeat(32),
  WORKOS_CLIENT_ID: "client_example",
  WORKOS_API_KEY: "sk_test_example",
  WORKOS_COOKIE_PASSWORD: "b".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://app.example.test/auth/callback",
  CREEM_API_KEY: "creem_api_key",
  CREEM_WEBHOOK_SECRET: "creem_webhook_secret",
  CREEM_STARTER_MONTHLY_PRODUCT_ID: "starter_monthly",
  CREEM_STARTER_ANNUAL_PRODUCT_ID: "starter_annual",
  CREEM_PRO_MONTHLY_PRODUCT_ID: "pro_monthly",
  CREEM_PRO_ANNUAL_PRODUCT_ID: "pro_annual",
  CREEM_GROWTH_MONTHLY_PRODUCT_ID: "growth_monthly",
  CREEM_GROWTH_ANNUAL_PRODUCT_ID: "growth_annual",
  CREEM_SCALE_MONTHLY_PRODUCT_ID: "scale_monthly",
  CREEM_SCALE_ANNUAL_PRODUCT_ID: "scale_annual",
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_ANON_KEY: "supabase_anon_key",
};

describe("web environment URL validation", () => {
  it("accepts an exact WorkOS redirect URI match", () => {
    expect(webEnvSchema.safeParse(baseEnvironment).success).toBe(true);
  });

  it("reports a mismatched WorkOS redirect URI on its field", () => {
    const result = webEnvSchema.safeParse({
      ...baseEnvironment,
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://app.example.test/wrong-callback",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["NEXT_PUBLIC_WORKOS_REDIRECT_URI"] }),
      ]),
    );
  });

  it("rejects an HTTP APP_URL in production", () => {
    const result = webEnvSchema.safeParse({
      ...baseEnvironment,
      NODE_ENV: "production",
      APP_URL: "http://app.example.test",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://app.example.test/auth/callback",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["APP_URL"] })]),
    );
  });

  it("accepts an HTTP APP_URL in development", () => {
    const result = webEnvSchema.safeParse({
      ...baseEnvironment,
      APP_URL: "http://app.example.test",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://app.example.test/auth/callback",
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-HTTP APP_URL protocols", () => {
    const result = webEnvSchema.safeParse({
      ...baseEnvironment,
      APP_URL: "ftp://app.example.test",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "ftp://app.example.test/auth/callback",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["APP_URL"] })]),
    );
  });
});
