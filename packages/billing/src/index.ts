import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PAID_BILLING_INTERVALS,
  PLANS,
  SELF_SERVE_PAID_PLAN_SLUGS,
  type PaidBillingInterval,
  type SelfServePaidPlanSlug,
} from "@supacontext/core";

export type PaidPlanSlug = SelfServePaidPlanSlug;

export type CreemProductIds = Record<PaidPlanSlug, Record<PaidBillingInterval, string>>;

export type CheckoutSessionInput = {
  workspaceId: string;
  plan: PaidPlanSlug;
  billingInterval: PaidBillingInterval;
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
  | "checkout.completed"
  | "subscription.active"
  | "subscription.paid"
  | "subscription.canceled"
  | "subscription.scheduled_cancel"
  | "subscription.past_due"
  | "subscription.expired"
  | "subscription.update"
  | "subscription.trialing"
  | "subscription.paused"
  | "refund.created"
  | "dispute.created"
  | "unknown";

export type BillingWebhookEvent = {
  source: "creem";
  externalId: string;
  eventType: BillingWebhookEventType;
  rawEventType: string;
  payload: unknown;
  workspaceId: string | null;
  plan: PaidPlanSlug | null;
  billingInterval: PaidBillingInterval | null;
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
  testMode?: boolean;
};

const productionBaseUrl = "https://api.creem.io";
const testBaseUrl = "https://test-api.creem.io";

function assertConfigured(value: string, name: string): string {
  if (!value || value === "replace_me" || value.startsWith("replace_")) {
    throw new BillingConfigurationError(`${name} is not configured.`);
  }

  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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
  const topLevelObject = asRecord(payload.object);

  if (Object.keys(topLevelObject).length > 0) {
    return topLevelObject;
  }

  const data = asRecord(payload.data);
  const object = asRecord(data.object);

  return Object.keys(object).length > 0 ? object : data;
}

function normalizeEventType(value: string | null): BillingWebhookEventType {
  if (!value) {
    return "unknown";
  }

  const normalized = value.replace(/_/g, ".").toLowerCase();

  if (normalized === "checkout.completed") {
    return "checkout.completed";
  }

  if (normalized === "subscription.active" || normalized === "subscription.created") {
    return "subscription.active";
  }

  if (normalized === "subscription.paid" || normalized === "payment.succeeded") {
    return "subscription.paid";
  }

  if (
    normalized === "subscription.canceled" ||
    normalized === "subscription.cancelled" ||
    normalized === "subscription.deleted"
  ) {
    return "subscription.canceled";
  }

  if (
    normalized === "subscription.scheduled.cancel" ||
    normalized === "subscription.scheduled_cancel"
  ) {
    return "subscription.scheduled_cancel";
  }

  if (
    normalized === "subscription.past.due" ||
    normalized === "subscription.past_due" ||
    normalized === "payment.failed"
  ) {
    return "subscription.past_due";
  }

  if (normalized === "subscription.expired") {
    return "subscription.expired";
  }

  if (normalized === "subscription.update" || normalized === "subscription.updated") {
    return "subscription.update";
  }

  if (normalized === "subscription.trialing") {
    return "subscription.trialing";
  }

  if (normalized === "subscription.paused") {
    return "subscription.paused";
  }

  if (normalized === "refund.created") {
    return "refund.created";
  }

  if (normalized === "dispute.created") {
    return "dispute.created";
  }

  return "unknown";
}

function productFromValue(
  value: string | null,
  productIds: CreemProductIds,
): { plan: PaidPlanSlug; billingInterval: PaidBillingInterval } | null {
  if (!value) {
    return null;
  }

  for (const plan of SELF_SERVE_PAID_PLAN_SLUGS) {
    for (const billingInterval of PAID_BILLING_INTERVALS) {
      if (productIds[plan][billingInterval] === value) {
        return { plan, billingInterval };
      }
    }
  }

  return null;
}

function planFromValue(value: string | null): PaidPlanSlug | null {
  return isPaidPlan(value) ? value : null;
}

function billingIntervalFromValue(value: string | null): PaidBillingInterval | null {
  return value === "month" || value === "year" ? value : null;
}

function metadataFrom(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...asRecord(data.metadata),
    ...asRecord(asRecord(data.subscription).metadata),
    ...asRecord(asRecord(data.checkout).metadata),
    ...asRecord(asRecord(data.order).metadata),
  };
}

function recordId(value: unknown): string | null {
  return firstString(value, asRecord(value).id);
}

function normalizeCreemEvent(
  rawPayload: unknown,
  productIds: CreemProductIds,
): BillingWebhookEvent {
  const payload = asRecord(rawPayload);
  const data = getEventData(payload);
  const metadata = metadataFrom(data);
  const rawEventType =
    firstString(payload.type, payload.event_type, payload.eventType) ?? "unknown";
  const eventType = normalizeEventType(rawEventType);
  const subscription = asRecord(data.subscription);
  const order = asRecord(data.order);
  const workspaceId = firstString(metadata.workspace_id, metadata.workspaceId, data.workspace_id);
  const productId = firstString(
    data.product_id,
    data.productId,
    recordId(data.product),
    recordId(subscription.product),
    recordId(order.product),
    metadata.product_id,
  );
  const product = productFromValue(productId, productIds);
  const plan =
    planFromValue(firstString(metadata.plan, metadata.plan_slug, data.plan_slug)) ??
    product?.plan ??
    null;
  const billingInterval =
    billingIntervalFromValue(
      firstString(metadata.billing_interval, metadata.billingInterval, data.billing_interval),
    ) ??
    product?.billingInterval ??
    null;
  const subscriptionId = firstString(
    data.subscription_id,
    data.subscriptionId,
    recordId(data.subscription),
    eventType.startsWith("subscription.") ? data.id : null,
  );
  const paymentId = firstString(
    data.payment_id,
    data.paymentId,
    data.transaction_id,
    data.transactionId,
    data.invoice_id,
    data.last_transaction_id,
    data.lastTransactionId,
    recordId(data.order),
    eventType === "subscription.paid" ? data.id : null,
  );
  const customerId = firstString(
    data.customer_id,
    data.customerId,
    recordId(data.customer),
    recordId(subscription.customer),
    recordId(order.customer),
  );
  const externalId = firstString(
    payload.id,
    payload.event_id,
    data.event_id,
    paymentId,
    subscriptionId,
  );

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
    billingInterval,
    customerId,
    subscriptionId,
    paymentId,
    status: firstString(data.status, subscription.status, order.status),
    currentPeriodStart: firstString(
      data.current_period_start,
      data.currentPeriodStart,
      data.current_period_start_date,
      data.currentPeriodStartDate,
      subscription.current_period_start,
      subscription.current_period_start_date,
    ),
    currentPeriodEnd: firstString(
      data.current_period_end,
      data.currentPeriodEnd,
      data.current_period_end_date,
      data.currentPeriodEndDate,
      subscription.current_period_end,
      subscription.current_period_end_date,
    ),
    cancelAtPeriodEnd:
      eventType === "subscription.scheduled_cancel" ||
      booleanValue(
        data.cancel_at_period_end ??
          data.cancelAtPeriodEnd ??
          subscription.cancel_at_period_end ??
          subscription.cancelAtPeriodEnd,
      ),
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
    const normalized = candidate.startsWith("sha256=")
      ? candidate.slice("sha256=".length)
      : candidate;

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
    this.baseUrl = (
      options.baseUrl ?? (options.testMode ? testBaseUrl : productionBaseUrl)
    ).replace(/\/$/, "");
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const productId = this.productIds[input.plan][input.billingInterval];

    if (!productId) {
      throw new BillingConfigurationError(`Creem product id is not configured for ${input.plan}.`);
    }

    const response = await fetch(`${this.baseUrl}/v1/checkouts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        product_id: productId,
        request_id: input.workspaceId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer: input.customerId ? { id: input.customerId } : undefined,
        metadata: {
          workspace_id: input.workspaceId,
          plan: input.plan,
          billing_interval: input.billingInterval,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return mapSessionResponse(response, "checkout");
  }

  async createPortalSession(input: PortalSessionInput): Promise<PortalSession> {
    const response = await fetch(`${this.baseUrl}/v1/customers/billing`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        customer_id: input.customerId,
        return_url: input.returnUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return mapSessionResponse(response, "portal", input.customerId);
  }

  async parseWebhook(payload: string, signature: string): Promise<BillingWebhookEvent> {
    if (!verifyCreemSignature({ payload, signature, webhookSecret: this.webhookSecret })) {
      throw new BillingSignatureError();
    }

    return normalizeCreemEvent(JSON.parse(payload) as unknown, this.productIds);
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "content-type": "application/json",
    };
  }
}

async function mapSessionResponse(
  response: Response,
  kind: "checkout" | "portal",
  externalIdFallback?: string,
): Promise<CheckoutSession | PortalSession> {
  const payload = asRecord(await response.json().catch(() => ({})));

  if (!response.ok) {
    throw new Error(`Creem ${kind} request failed with status ${response.status}.`);
  }

  const url = firstString(
    payload.url,
    payload.checkout_url,
    payload.portal_url,
    payload.customer_portal_link,
  );
  const externalId = firstString(payload.id, payload.session_id, externalIdFallback);

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
    starter: {
      month: assertConfigured(
        source.CREEM_STARTER_MONTHLY_PRODUCT_ID ?? "",
        "CREEM_STARTER_MONTHLY_PRODUCT_ID",
      ),
      year: assertConfigured(
        source.CREEM_STARTER_ANNUAL_PRODUCT_ID ?? "",
        "CREEM_STARTER_ANNUAL_PRODUCT_ID",
      ),
    },
    pro: {
      month: assertConfigured(
        source.CREEM_PRO_MONTHLY_PRODUCT_ID ?? "",
        "CREEM_PRO_MONTHLY_PRODUCT_ID",
      ),
      year: assertConfigured(
        source.CREEM_PRO_ANNUAL_PRODUCT_ID ?? "",
        "CREEM_PRO_ANNUAL_PRODUCT_ID",
      ),
    },
    growth: {
      month: assertConfigured(
        source.CREEM_GROWTH_MONTHLY_PRODUCT_ID ?? "",
        "CREEM_GROWTH_MONTHLY_PRODUCT_ID",
      ),
      year: assertConfigured(
        source.CREEM_GROWTH_ANNUAL_PRODUCT_ID ?? "",
        "CREEM_GROWTH_ANNUAL_PRODUCT_ID",
      ),
    },
    scale: {
      month: assertConfigured(
        source.CREEM_SCALE_MONTHLY_PRODUCT_ID ?? "",
        "CREEM_SCALE_MONTHLY_PRODUCT_ID",
      ),
      year: assertConfigured(
        source.CREEM_SCALE_ANNUAL_PRODUCT_ID ?? "",
        "CREEM_SCALE_ANNUAL_PRODUCT_ID",
      ),
    },
  };
}

export function isPaidPlan(value: unknown): value is PaidPlanSlug {
  return typeof value === "string" && SELF_SERVE_PAID_PLAN_SLUGS.includes(value as PaidPlanSlug);
}

export function paidPlanCredits(
  plan: PaidPlanSlug,
  billingInterval: PaidBillingInterval = "month",
): number {
  return PLANS[plan].includedCredits * (billingInterval === "year" ? 12 : 1);
}
