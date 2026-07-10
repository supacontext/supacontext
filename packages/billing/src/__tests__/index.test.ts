import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreemBillingClient, paidPlanCredits, verifyCreemSignature } from "../index.js";

const productIds = {
  starter: { month: "prod_starter_month", year: "prod_starter_year" },
  pro: { month: "prod_pro_month", year: "prod_pro_year" },
  growth: { month: "prod_growth_month", year: "prod_growth_year" },
  scale: { month: "prod_scale_month", year: "prod_scale_year" },
};

function sign(payload: string, secret = "webhook_secret"): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function createClient(): CreemBillingClient {
  return new CreemBillingClient({
    apiKey: "creem_key",
    webhookSecret: "webhook_secret",
    productIds,
    testMode: true,
  });
}

function webhookPayload(eventType: string, object: Record<string, unknown>): string {
  return JSON.stringify({
    id: `evt_${eventType.replace(/[^a-z0-9]/gi, "_")}`,
    eventType,
    created_at: 1728734325927,
    object,
  });
}

describe("Creem billing adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("grants the advertised monthly credits for monthly and annual billing", () => {
    expect(paidPlanCredits("starter", "month")).toBe(5_000);
    expect(paidPlanCredits("starter", "year")).toBe(60_000);
    expect(paidPlanCredits("growth", "month")).toBe(75_000);
  });

  it("verifies webhook signatures with timing-safe HMAC comparison", () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const signature = `t=1,v1=${sign(payload)}`;

    expect(verifyCreemSignature({ payload, signature, webhookSecret: "webhook_secret" })).toBe(
      true,
    );
    expect(
      verifyCreemSignature({ payload, signature: "v1=bad", webhookSecret: "webhook_secret" }),
    ).toBe(false);
  });

  it("normalizes subscription lifecycle events", async () => {
    const payload = webhookPayload("subscription.active", {
      id: "sub_1",
      customer: {
        id: "cus_1",
      },
      product: {
        id: "prod_growth_year",
      },
      status: "active",
      current_period_end_date: "2026-08-01T00:00:00.000Z",
      metadata: {
        workspace_id: "workspace_1",
      },
    });

    await expect(createClient().parseWebhook(payload, sign(payload))).resolves.toMatchObject({
      externalId: "evt_subscription_active",
      eventType: "subscription.active",
      workspaceId: "workspace_1",
      plan: "growth",
      billingInterval: "year",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
    });
  });

  it("normalizes payment succeeded events for idempotent credit grants", async () => {
    const payload = webhookPayload("subscription.paid", {
      id: "sub_1",
      last_transaction_id: "tran_1",
      customer: "cus_1",
      product: "prod_pro_month",
      metadata: {
        workspace_id: "workspace_1",
        plan: "pro",
      },
    });

    await expect(createClient().parseWebhook(payload, sign(payload))).resolves.toMatchObject({
      externalId: "evt_subscription_paid",
      eventType: "subscription.paid",
      workspaceId: "workspace_1",
      plan: "pro",
      billingInterval: "month",
      paymentId: "tran_1",
      subscriptionId: "sub_1",
    });
  });

  it("normalizes checkout completed events with top-level objects", async () => {
    const payload = webhookPayload("checkout.completed", {
      id: "chk_1",
      order: {
        id: "ord_1",
        customer: "cus_1",
        product: "prod_growth_month",
      },
      subscription: {
        id: "sub_1",
        metadata: {
          workspace_id: "workspace_1",
          plan: "growth",
        },
      },
      customer: {
        id: "cus_1",
      },
      product: {
        id: "prod_growth_month",
      },
      status: "completed",
    });

    await expect(createClient().parseWebhook(payload, sign(payload))).resolves.toMatchObject({
      eventType: "checkout.completed",
      workspaceId: "workspace_1",
      plan: "growth",
      billingInterval: "month",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      paymentId: "ord_1",
      status: "completed",
    });
  });

  it("normalizes cancellation and past-due subscription events", async () => {
    const canceled = webhookPayload("subscription.canceled", {
      id: "sub_1",
      customer: "cus_1",
      product: "prod_starter_month",
      status: "canceled",
      metadata: {
        workspace_id: "workspace_1",
      },
    });
    const pastDue = webhookPayload("subscription.past_due", {
      id: "sub_2",
      customer: "cus_2",
      product: "prod_scale_month",
      status: "past_due",
      metadata: {
        workspace_id: "workspace_2",
      },
    });

    await expect(createClient().parseWebhook(canceled, sign(canceled))).resolves.toMatchObject({
      eventType: "subscription.canceled",
      status: "canceled",
      plan: "starter",
    });
    await expect(createClient().parseWebhook(pastDue, sign(pastDue))).resolves.toMatchObject({
      eventType: "subscription.past_due",
      status: "past_due",
      plan: "scale",
    });
  });

  it("keeps duplicate webhook deliveries on the same external id", async () => {
    const payload = webhookPayload("subscription.paid", {
      id: "sub_1",
      last_transaction_id: "tran_1",
      customer: "cus_1",
      product: "prod_pro_month",
      metadata: {
        workspace_id: "workspace_1",
      },
    });
    const first = await createClient().parseWebhook(payload, sign(payload));
    const second = await createClient().parseWebhook(payload, sign(payload));

    expect(second.externalId).toBe(first.externalId);
  });

  it("uses documented Creem REST hosts, auth, and response fields", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "chk_1",
        checkout_url: "https://checkout.creem.io/chk_1",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const session = await createClient().createCheckoutSession({
      workspaceId: "workspace_1",
      plan: "growth",
      billingInterval: "year",
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
    });
    const call = fetchMock.mock.calls[0];

    expect(call).toBeDefined();
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("https://test-api.creem.io/v1/checkouts");
    expect(init.headers).toMatchObject({
      "x-api-key": "creem_key",
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      product_id: "prod_growth_year",
      request_id: "workspace_1",
      metadata: {
        workspace_id: "workspace_1",
        plan: "growth",
        billing_interval: "year",
      },
    });
    expect(session.url).toBe("https://checkout.creem.io/chk_1");
  });

  it("creates customer portal links through the documented billing endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        customer_portal_link: "https://creem.io/customer/billing/cus_1",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const session = await createClient().createPortalSession({
      customerId: "cus_1",
      returnUrl: "https://app.example.com/billing",
    });
    const call = fetchMock.mock.calls[0];

    expect(call).toBeDefined();
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("https://test-api.creem.io/v1/customers/billing");
    expect(init.headers).toMatchObject({
      "x-api-key": "creem_key",
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      customer_id: "cus_1",
    });
    expect(session.url).toBe("https://creem.io/customer/billing/cus_1");
  });
});
