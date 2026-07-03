import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CreemBillingClient, verifyCreemSignature } from "../index.js";

const productIds = {
  starter: "prod_starter",
  builder: "prod_builder",
  pro: "prod_pro",
  scale: "prod_scale",
};

function sign(payload: string, secret = "webhook_secret"): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("Creem billing adapter", () => {
  it("verifies webhook signatures with timing-safe HMAC comparison", () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const signature = `t=1,v1=${sign(payload)}`;

    expect(verifyCreemSignature({ payload, signature, webhookSecret: "webhook_secret" })).toBe(true);
    expect(verifyCreemSignature({ payload, signature: "v1=bad", webhookSecret: "webhook_secret" })).toBe(false);
  });

  it("normalizes subscription lifecycle events", async () => {
    const payload = JSON.stringify({
      id: "evt_sub_created",
      type: "subscription.created",
      data: {
        id: "sub_1",
        customer_id: "cus_1",
        product_id: "prod_builder",
        status: "active",
        current_period_end: "2026-08-01T00:00:00.000Z",
        metadata: {
          workspace_id: "workspace_1",
        },
      },
    });
    const client = new CreemBillingClient({
      apiKey: "creem_key",
      webhookSecret: "webhook_secret",
      productIds,
    });

    await expect(client.parseWebhook(payload, sign(payload))).resolves.toMatchObject({
      externalId: "evt_sub_created",
      eventType: "subscription.created",
      workspaceId: "workspace_1",
      plan: "builder",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
    });
  });

  it("normalizes payment succeeded events for idempotent credit grants", async () => {
    const payload = JSON.stringify({
      id: "evt_payment",
      type: "payment.succeeded",
      data: {
        id: "pay_1",
        subscription_id: "sub_1",
        customer_id: "cus_1",
        metadata: {
          workspace_id: "workspace_1",
          plan: "pro",
        },
      },
    });
    const client = new CreemBillingClient({
      apiKey: "creem_key",
      webhookSecret: "webhook_secret",
      productIds,
    });

    await expect(client.parseWebhook(payload, sign(payload))).resolves.toMatchObject({
      externalId: "evt_payment",
      eventType: "payment.succeeded",
      workspaceId: "workspace_1",
      plan: "pro",
      paymentId: "pay_1",
      subscriptionId: "sub_1",
    });
  });
});
