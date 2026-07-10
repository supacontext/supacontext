import "server-only";

import {
  BillingConfigurationError,
  BillingSignatureError,
  CreemBillingClient,
  isPaidPlan,
  paidPlanCredits,
  readCreemProductIds,
  type BillingWebhookEvent,
  type PaidPlanSlug,
} from "@supacontext/billing";
import { CREDIT_MICROS, type PaidBillingInterval } from "@supacontext/core";
import { createDatabaseClient, type DatabaseClient } from "@supacontext/db";
import type postgres from "postgres";
import { webEnv } from "./env";

let database: DatabaseClient | undefined;

type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";

type ProcessWebhookResult = {
  eventType: string;
  duplicate: boolean;
};

function getDatabase(): DatabaseClient {
  if (database) {
    return database;
  }

  database = createDatabaseClient({
    url: webEnv.DATABASE_URL,
    maxConnections: 3,
  });

  return database;
}

function getAppUrl(): string {
  return webEnv.APP_URL;
}

function getCreemClient(): CreemBillingClient {
  return new CreemBillingClient({
    apiKey: webEnv.CREEM_API_KEY,
    webhookSecret: webEnv.CREEM_WEBHOOK_SECRET,
    productIds: readCreemProductIds(webEnv),
    testMode: webEnv.NODE_ENV !== "production",
  });
}

function toDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function normalizeStatus(event: BillingWebhookEvent): SubscriptionStatus {
  if (event.eventType === "subscription.canceled") {
    return "cancelled";
  }

  if (event.eventType === "subscription.expired") {
    return "expired";
  }

  if (event.eventType === "subscription.scheduled_cancel") {
    return "active";
  }

  const status = event.status?.toLowerCase().replace(/-/g, "_") ?? "";

  if (status.includes("trial")) {
    return "trialing";
  }

  if (status.includes("past_due") || status.includes("unpaid") || status.includes("failed")) {
    return "past_due";
  }

  if (status.includes("cancel")) {
    return "cancelled";
  }

  if (status.includes("expire") || status.includes("delete")) {
    return "expired";
  }

  return "active";
}

async function findWorkspaceId(
  transaction: postgres.TransactionSql,
  event: BillingWebhookEvent,
): Promise<string | null> {
  if (event.workspaceId) {
    return event.workspaceId;
  }

  if (event.subscriptionId) {
    const rows = await transaction<Array<{ workspace_id: string }>>`
      select workspace_id
      from subscriptions
      where creem_subscription_id = ${event.subscriptionId}
      limit 1
    `;

    if (rows[0]) {
      return rows[0].workspace_id;
    }
  }

  if (event.customerId) {
    const rows = await transaction<Array<{ workspace_id: string }>>`
      select workspace_id
      from subscriptions
      where creem_customer_id = ${event.customerId}
      order by updated_at desc
      limit 1
    `;

    return rows[0]?.workspace_id ?? null;
  }

  return null;
}

async function findPlan(
  transaction: postgres.TransactionSql,
  event: BillingWebhookEvent,
): Promise<PaidPlanSlug | null> {
  if (event.plan) {
    return event.plan;
  }

  if (!event.subscriptionId) {
    return null;
  }

  const rows = await transaction<Array<{ plan_slug: string }>>`
    select plan_slug
    from subscriptions
    where creem_subscription_id = ${event.subscriptionId}
    limit 1
  `;
  const plan = rows[0]?.plan_slug;

  return isPaidPlan(plan) ? plan : null;
}

async function findBillingInterval(
  transaction: postgres.TransactionSql,
  event: BillingWebhookEvent,
): Promise<PaidBillingInterval | null> {
  if (event.billingInterval) {
    return event.billingInterval;
  }

  if (!event.subscriptionId) {
    return null;
  }

  const rows = await transaction<Array<{ billing_interval: PaidBillingInterval | null }>>`
    select billing_interval
    from subscriptions
    where creem_subscription_id = ${event.subscriptionId}
    limit 1
  `;

  return rows[0]?.billing_interval ?? null;
}

async function upsertSubscription(
  transaction: postgres.TransactionSql,
  event: BillingWebhookEvent,
): Promise<void> {
  const workspaceId = await findWorkspaceId(transaction, event);
  const plan = await findPlan(transaction, event);
  const billingInterval = await findBillingInterval(transaction, event);

  if (!workspaceId || !plan || !billingInterval || !event.subscriptionId) {
    throw new BillingConfigurationError(
      "Creem subscription event is missing workspace, plan, billing interval, or subscription id.",
    );
  }

  await transaction`
    insert into subscriptions (
      workspace_id,
      plan_slug,
      billing_interval,
      status,
      creem_customer_id,
      creem_subscription_id,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    values (
      ${workspaceId},
      ${plan}::plan_slug,
      ${billingInterval},
      ${normalizeStatus(event)}::subscription_status,
      ${event.customerId},
      ${event.subscriptionId},
      ${toDate(event.currentPeriodStart)},
      ${toDate(event.currentPeriodEnd)},
      ${event.cancelAtPeriodEnd}
    )
    on conflict (creem_subscription_id) do update
    set
      workspace_id = excluded.workspace_id,
      plan_slug = excluded.plan_slug,
      billing_interval = excluded.billing_interval,
      status = excluded.status,
      creem_customer_id = coalesce(excluded.creem_customer_id, subscriptions.creem_customer_id),
      current_period_start = coalesce(excluded.current_period_start, subscriptions.current_period_start),
      current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
      cancel_at_period_end = excluded.cancel_at_period_end
  `;
}

async function grantBillingPeriodCredits(
  transaction: postgres.TransactionSql,
  event: BillingWebhookEvent,
): Promise<void> {
  const workspaceId = await findWorkspaceId(transaction, event);
  const plan = await findPlan(transaction, event);
  const billingInterval = await findBillingInterval(transaction, event);

  if (!workspaceId || !plan || !billingInterval) {
    throw new BillingConfigurationError(
      "Creem payment event is missing workspace, paid plan, or billing interval.",
    );
  }

  const grantRows = await transaction<Array<{ id: string }>>`
    insert into usage_ledger (
      workspace_id,
      event_type,
      credit_microcredits,
      idempotency_key,
      metadata
    )
    values (
      ${workspaceId},
      'grant'::ledger_event_type,
      ${(BigInt(paidPlanCredits(plan, billingInterval)) * CREDIT_MICROS).toString()},
      ${`creem:payment:${event.paymentId ?? event.externalId}:credits`},
      ${transaction.json({
        provider: "creem",
        event_id: event.externalId,
        payment_id: event.paymentId,
        subscription_id: event.subscriptionId,
        plan,
        billing_interval: billingInterval,
        included_credits_per_month: paidPlanCredits(plan),
      })}
    )
    on conflict (workspace_id, idempotency_key)
    where idempotency_key is not null
    do nothing
    returning id
  `;

  if (!grantRows[0]) {
    return;
  }

  await transaction`
    update api_keys
    set month_to_date_microcredits = 0
    where workspace_id = ${workspaceId}
  `;
}

async function applyCreemEvent(
  transaction: postgres.TransactionSql,
  event: BillingWebhookEvent,
): Promise<void> {
  if (
    event.eventType === "checkout.completed" ||
    event.eventType === "subscription.active" ||
    event.eventType === "subscription.update" ||
    event.eventType === "subscription.trialing" ||
    event.eventType === "subscription.scheduled_cancel" ||
    event.eventType === "subscription.canceled" ||
    event.eventType === "subscription.expired" ||
    event.eventType === "subscription.paused" ||
    event.eventType === "subscription.past_due"
  ) {
    await upsertSubscription(transaction, event);
    return;
  }

  if (event.eventType === "subscription.paid") {
    if (event.subscriptionId) {
      await upsertSubscription(transaction, event);
    }

    await grantBillingPeriodCredits(transaction, event);
    return;
  }
}

export async function createCreemCheckout(
  workspaceId: string,
  plan: PaidPlanSlug,
  billingInterval: PaidBillingInterval,
): Promise<string> {
  const sql = getDatabase();
  const customerRows = await sql<Array<{ creem_customer_id: string | null }>>`
    select creem_customer_id
    from subscriptions
    where workspace_id = ${workspaceId}
      and creem_customer_id is not null
    order by updated_at desc
    limit 1
  `;
  const session = await getCreemClient().createCheckoutSession({
    workspaceId,
    plan,
    billingInterval,
    customerId: customerRows[0]?.creem_customer_id ?? null,
    successUrl: `${getAppUrl()}/billing?checkout=success`,
    cancelUrl: `${getAppUrl()}/billing?checkout=cancelled`,
  });

  return session.url;
}

export async function createCreemPortal(workspaceId: string): Promise<string> {
  const sql = getDatabase();
  const rows = await sql<Array<{ creem_customer_id: string | null }>>`
    select creem_customer_id
    from subscriptions
    where workspace_id = ${workspaceId}
      and creem_customer_id is not null
    order by updated_at desc
    limit 1
  `;
  const customerId = rows[0]?.creem_customer_id;

  if (!customerId) {
    throw new BillingConfigurationError("No Creem customer exists for this workspace.");
  }

  const session = await getCreemClient().createPortalSession({
    customerId,
    returnUrl: `${getAppUrl()}/billing`,
  });

  return session.url;
}

export async function processCreemWebhook(
  rawBody: string,
  signature: string,
): Promise<ProcessWebhookResult> {
  const event = await getCreemClient().parseWebhook(rawBody, signature);
  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const inserted = await transaction<Array<{ id: string; processed_at: Date | null }>>`
      insert into webhooks (
        source,
        external_id,
        event_type,
        payload,
        signature_valid
      )
      values (
        'creem',
        ${event.externalId},
        ${event.rawEventType},
        ${transaction.json(event.payload as postgres.JSONValue)},
        true
      )
      on conflict (source, external_id)
      where external_id is not null
      do nothing
      returning id, processed_at
    `;
    let webhook = inserted[0];

    if (!webhook) {
      const existing = await transaction<Array<{ id: string; processed_at: Date | null }>>`
        select id, processed_at
        from webhooks
        where source = 'creem'
          and external_id = ${event.externalId}
        for update
      `;
      webhook = existing[0];

      if (webhook?.processed_at) {
        return {
          eventType: event.eventType,
          duplicate: true,
        };
      }
    }

    if (!webhook) {
      throw new BillingConfigurationError("Could not persist Creem webhook receipt.");
    }

    try {
      await applyCreemEvent(transaction, event);
      await transaction`
        update webhooks
        set
          processed_at = now(),
          error_message = null
        where id = ${webhook.id}
      `;
    } catch (error) {
      await transaction`
        update webhooks
        set error_message = ${error instanceof Error ? error.message : "Webhook processing failed."}
        where id = ${webhook.id}
      `;
      throw error;
    }

    return {
      eventType: event.eventType,
      duplicate: false,
    };
  });
}

export function billingErrorToResponse(error: unknown): Response {
  if (error instanceof BillingSignatureError) {
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: error.message,
        },
      },
      { status: 401 },
    );
  }

  if (error instanceof BillingConfigurationError) {
    return Response.json(
      {
        error: {
          code: "billing_not_configured",
          message: error.message,
        },
      },
      { status: 400 },
    );
  }

  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Billing request failed.",
      },
    },
    { status: 500 },
  );
}
