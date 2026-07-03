import { createHmac, timingSafeEqual } from "node:crypto";
import { PLANS, type PlanSlug } from "@supacontext/core";

export type PaidPlanSlug = Exclude<PlanSlug, "trial">;

export type CreemProductIds = Record<PaidPlanSlug, string>;

export type CheckoutSessionInput = {
  workspaceId: string;
  plan: PaidPlanSlug;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
};

export type CheckoutSession = {
  provider: "creem";
  url: string;
  externalId: string;
};

export type PortalSessionInput = {
  customerId: string;
  returnUrl: string;
};

export type PortalSession = {
  provider: "creem";
  url: string;
  externalId: string;
};

export type BillingWebhookEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.cancelled"
  | "payment.succeeded"
  | "payment.failed"
  | "unknown";

export type BillingWebhookEvent = {
  source: "creem";
  externalId: string;
  eventType: BillingWebhookEventType;
  rawEventType: string;
  payload: unknown;
  workspaceId: string | null;
  plan: PaidPlanSlug | null;
  customerId: string | null;
  subscriptionId: string | null;
  paymentId: string | null;
  status: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export interface BillingClient {
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  createPortalSession(input: PortalSessionInput): Promise<PortalSession>;
  parseWebhook(payload: string, signature: string): Promise<BillingWebhookEvent>;
}

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export class BillingSignatureError extends Error {
  constructor() {
    super("Invalid Creem webhook signature.");
    this.name = "BillingSignatureError";
  }
}

export type CreemBillingClientOptions = {
  apiKey: string;
  webhookSecret: string;
  productIds: CreemProductIds;
  baseUrl?: string;
};

const defaultBaseUrl = "https://api.creem.io";

function assertConfigured(value: string, name: string): string {
  if (!value || value === "replace_me" || value.startsWith("replace_")) {
    throw new BillingConfigurationError(`${name} is not configured.`);
  }

  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const string = stringValue(value);

    if (string) {
      return string;
    }
  }

  return null;
}

function getEventData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(payload.data);
  const object = asRecord(data.object);

  return Object.keys(object).length > 0 ? object : data;
}

function normalizeEventType(value: string | null): BillingWebhookEventType {
  if (!value) {
    return "unknown";
  }

  const normalized = value.replace(/_/g, ".").toLowerCase();

  if (normalized.includes("subscription") && normalized.includes("created")) {
    return "subscription.created";
  }

  if (normalized.includes("subscription") && normalized.includes("updated")) {
    return "subscription.updated";
  }

  if (
    normalized.includes("subscription") &&
    (normalized.includes("cancelled") || normalized.includes("canceled") || normalized.includes("deleted"))
  ) {
    return "subscription.cancelled";
  }

  if (normalized.includes("payment") && (normalized.includes("succeeded") || normalized.includes("paid"))) {
    return "payment.succeeded";
  }

  if (normalized.includes("payment") && (normalized.includes("failed") || normalized.includes("past_due"))) {
    return "payment.failed";
  }

  return "unknown";
}

function planFromValue(
  value: string | null,
  productIds: CreemProductIds,
): PaidPlanSlug | null {
  if (value === "starter" || value === "builder" || value === "pro" || value === "scale") {
    return value;
  }

  const match = Object.entries(productIds).find(([, productId]) => productId === value)?.[0];

  return match ? match as PaidPlanSlug : null;
}

function metadataFrom(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...asRecord(data.metadata),
    ...asRecord(asRecord(data.subscription).metadata),
    ...asRecord(asRecord(data.checkout).metadata),
  };
}

function normalizeCreemEvent(
  rawPayload: unknown,
  productIds: CreemProductIds,
): BillingWebhookEvent {
  const payload = asRecord(rawPayload);
  const data = getEventData(payload);
  const metadata = metadataFrom(data);
  const rawEventType = firstString(payload.type, payload.event_type, payload.eventType) ?? "unknown";
  const eventType = normalizeEventType(rawEventType);
  const subscription = asRecord(data.subscription);
  const customer = asRecord(data.customer);
  const product = asRecord(data.product);
  const workspaceId = firstString(metadata.workspace_id, metadata.workspaceId, data.workspace_id);
  const productId = firstString(data.product_id, product.id, metadata.product_id);
  const plan = planFromValue(firstString(metadata.plan, metadata.plan_slug, data.plan_slug) ?? productId, productIds);
  const subscriptionId = firstString(
    data.subscription_id,
    data.subscriptionId,
    subscription.id,
    eventType.startsWith("subscription.") ? data.id : null,
  );
  const paymentId = firstString(
    data.payment_id,
    data.paymentId,
    data.invoice_id,
    eventType.startsWith("payment.") ? data.id : null,
  );
  const customerId = firstString(data.customer_id, data.customerId, customer.id);
  const externalId = firstString(payload.id, payload.event_id, data.event_id, paymentId, subscriptionId);

  if (!externalId) {
    throw new BillingConfigurationError("Creem webhook event did not include a stable id.");
  }

  return {
    source: "creem",
    externalId,
    eventType,
    rawEventType,
    payload: rawPayload,
    workspaceId,
    plan,
    customerId,
    subscriptionId,
    paymentId,
    status: firstString(data.status, subscription.status),
    currentPeriodStart: firstString(
      data.current_period_start,
      data.currentPeriodStart,
      subscription.current_period_start,
    ),
    currentPeriodEnd: firstString(
      data.current_period_end,
      data.currentPeriodEnd,
      subscription.current_period_end,
    ),
    cancelAtPeriodEnd: booleanValue(data.cancel_at_period_end ?? subscription.cancel_at_period_end),
  };
}

function signatureCandidates(signature: string): string[] {
  return signature
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      const value = part.includes("=") ? part.split("=").at(-1) : part;

      return value ? [value.trim()] : [];
    })
    .filter(Boolean);
}

function safeEqualHex(candidate: string, expected: string): boolean {
  try {
    const left = Buffer.from(candidate, "hex");
    const right = Buffer.from(expected, "hex");

    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function verifyCreemSignature(input: {
  payload: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  const expected = createHmac("sha256", input.webhookSecret).update(input.payload).digest("hex");

  return signatureCandidates(input.signature).some((candidate) => {
    const normalized = candidate.startsWith("sha256=") ? candidate.slice("sha256=".length) : candidate;

    return safeEqualHex(normalized, expected);
  });
}

export class CreemBillingClient implements BillingClient {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly productIds: CreemProductIds;
  private readonly baseUrl: string;

  constructor(options: CreemBillingClientOptions) {
    this.apiKey = assertConfigured(options.apiKey, "CREEM_API_KEY");
    this.webhookSecret = assertConfigured(options.webhookSecret, "CREEM_WEBHOOK_SECRET");
    this.productIds = options.productIds;
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, "");
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const productId = this.productIds[input.plan];

    if (!productId) {
      throw new BillingConfigurationError(`Creem product id is not configured for ${input.plan}.`);
    }

    // TODO(creem): Verify Creem's exact checkout endpoint and payload field names before production traffic.
    const response = await fetch(`${this.baseUrl}/v1/checkouts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        product_id: productId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer_id: input.customerId ?? undefined,
        metadata: {
          workspace_id: input.workspaceId,
          plan: input.plan,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return mapSessionResponse(response, "checkout");
  }

  async createPortalSession(input: PortalSessionInput): Promise<PortalSession> {
    // TODO(creem): Verify Creem's exact customer portal endpoint and payload field names before production traffic.
    const response = await fetch(`${this.baseUrl}/v1/customers/${encodeURIComponent(input.customerId)}/portal`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        return_url: input.returnUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return mapSessionResponse(response, "portal");
  }

  async parseWebhook(payload: string, signature: string): Promise<BillingWebhookEvent> {
    if (!verifyCreemSignature({ payload, signature, webhookSecret: this.webhookSecret })) {
      throw new BillingSignatureError();
    }

    return normalizeCreemEvent(JSON.parse(payload) as unknown, this.productIds);
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
    };
  }
}

async function mapSessionResponse(
  response: Response,
  kind: "checkout" | "portal",
): Promise<CheckoutSession | PortalSession> {
  const payload = asRecord(await response.json().catch(() => ({})));

  if (!response.ok) {
    throw new Error(`Creem ${kind} request failed with status ${response.status}.`);
  }

  const url = firstString(payload.url, payload.checkout_url, payload.portal_url);
  const externalId = firstString(payload.id, payload.session_id);

  if (!url || !externalId) {
    throw new Error(`Creem ${kind} response did not include url and id.`);
  }

  return {
    provider: "creem",
    url,
    externalId,
  };
}

export function readCreemProductIds(source: NodeJS.ProcessEnv = process.env): CreemProductIds {
  return {
    starter: assertConfigured(source.CREEM_STARTER_PRODUCT_ID ?? "", "CREEM_STARTER_PRODUCT_ID"),
    builder: assertConfigured(source.CREEM_BUILDER_PRODUCT_ID ?? "", "CREEM_BUILDER_PRODUCT_ID"),
    pro: assertConfigured(source.CREEM_PRO_PRODUCT_ID ?? "", "CREEM_PRO_PRODUCT_ID"),
    scale: assertConfigured(source.CREEM_SCALE_PRODUCT_ID ?? "", "CREEM_SCALE_PRODUCT_ID"),
  };
}

export function isPaidPlan(value: unknown): value is PaidPlanSlug {
  return value === "starter" || value === "builder" || value === "pro" || value === "scale";
}

export function paidPlanCredits(plan: PaidPlanSlug): number {
  return PLANS[plan].includedCredits;
}
