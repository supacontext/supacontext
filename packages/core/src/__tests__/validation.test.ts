import { describe, expect, it } from "vitest";
import { contextRequestInputSchema, validateWebhookUrl } from "../validation.js";

describe("context request validation", () => {
  it("trims and validates webhook URLs", async () => {
    const parsed = await contextRequestInputSchema.parseAsync({
      query: "SupaContext",
      webhook_url: " https://8.8.8.8/webhook ",
    });

    expect(parsed.webhook_url).toBe("https://8.8.8.8/webhook");
  });

  it("rejects unsafe webhook URLs", async () => {
    await expect(validateWebhookUrl("http://example.com/webhook")).resolves.toBe(false);
    await expect(validateWebhookUrl("https://user:pass@example.com/webhook")).resolves.toBe(false);
    await expect(validateWebhookUrl("https://127.0.0.1/webhook")).resolves.toBe(false);
    await expect(validateWebhookUrl("https://localhost/webhook")).resolves.toBe(false);
    await expect(
      validateWebhookUrl("https://hooks.example.com/webhook", async () => [
        { address: "10.0.0.12" },
      ]),
    ).resolves.toBe(false);
    await expect(
      validateWebhookUrl("https://hooks.example.com/webhook", async () => [
        { address: "172.16.0.12" },
      ]),
    ).resolves.toBe(false);
    await expect(
      validateWebhookUrl("https://hooks.example.com/webhook", async () => [
        { address: "192.168.1.12" },
      ]),
    ).resolves.toBe(false);
    await expect(
      validateWebhookUrl("https://hooks.example.com/webhook", async () => [
        { address: "93.184.216.34" },
      ]),
    ).resolves.toBe(true);
  });

  it("limits metadata size", () => {
    expect(
      contextRequestInputSchema.safeParse({
        query: "SupaContext",
        metadata: Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`key_${index}`, true]),
        ),
      }).success,
    ).toBe(false);

    expect(
      contextRequestInputSchema.safeParse({
        query: "SupaContext",
        metadata: {
          oversized: "x".repeat(4097),
        },
      }).success,
    ).toBe(false);
  });
});
