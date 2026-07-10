import "server-only";

import { randomBytes } from "node:crypto";
import { isPaidPlan, type PaidPlanSlug } from "@supacontext/billing";
import {
  CONTEXT_EFFORTS,
  CREDIT_MICROS,
  EFFORT_PROFILES,
  PLANS,
  PLAN_SLUGS,
  PLATFORMS,
  PRICING_VERSION,
  creditDecimalToMicrocredits,
  creditMicrocreditsToDisplayNumber,
  createApiKeyMaterial,
  type ContextEffort,
  type PaidBillingInterval,
  type Platform,
  type PlanSlug,
  type PublicContextResponse,
  type RequestStatus,
  type ResolvedEffort,
} from "@supacontext/core";
import { createDatabaseClient, type DatabaseClient } from "@supacontext/db";
import { authorizeUsage } from "@supacontext/usage";
import { withAuth } from "@workos-inc/authkit-nextjs";
import type { User } from "@workos-inc/node";
import { redirect } from "next/navigation";
import { parseApiKeyForm } from "../api-key-form";
import { createCreemCheckout, createCreemPortal } from "./billing";
import { webEnv } from "./env";

let database: DatabaseClient | undefined;

export type WorkspaceContext = {
  profileId: string;
  workspaceId: string;
  workosUserId: string;
  email: string | null;
  displayName: string | null;
};

export type DashboardApiKey = {
  id: string;
  name: string;
  prefix: string;
  maxEffort: ResolvedEffort;
  monthlyCreditLimit: number | null;
  monthToDateCredits: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DashboardPlanState = {
  slug: PlanSlug;
  name: string;
  includedCredits: number | null;
  priceCents: number | null;
  annualPriceCents: number | null;
  billingInterval: PaidBillingInterval | null;
  status: string;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
};

export type UsageRequest = {
  id: string;
  keyName: string | null;
  query: string;
  effort: ContextEffort;
  resolvedEffort: ResolvedEffort | null;
  platforms: Platform[];
  status: RequestStatus;
  creditsCharged: number;
  creditsReserved: number;
  sourcesUsed: number;
  cached: boolean;
  latencyMs: number | null;
  error: string | null;
  resultJson: unknown | null;
  createdAt: string;
};

export type UsageFilters = {
  from?: string;
  to?: string;
  keyId?: string;
  effort?: ContextEffort;
  status?: RequestStatus;
};

type PlanRow = {
  plan_slug: PlanSlug;
  billing_interval: PaidBillingInterval | null;
  status: string;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
};

type ApiKeySelectRow = {
  id: string;
  name: string;
  prefix: string;
  max_effort: ResolvedEffort;
  monthly_credit_limit_microcredits: string | null;
  month_to_date_microcredits: string;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

type UsageRequestRow = {
  id: string;
  key_name: string | null;
  query: string;
  effort: ContextEffort;
  resolved_effort: ResolvedEffort | null;
  platforms: Platform[];
  status: RequestStatus;
  reserved_microcredits: string;
  spent_microcredits: string;
  error_code: string | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  response_json: unknown | null;
  citation_count: number | null;
};

type PlaygroundApiKeyRow = {
  id: string;
  max_effort: ResolvedEffort;
  monthly_credit_limit_microcredits: string | null;
  month_to_date_microcredits: string;
};

export class DashboardError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DashboardError";
  }
}

function getDatabase(): DatabaseClient {
  if (database) {
    return database;
  }

  const url = webEnv.DATABASE_URL;

  if (!url) {
    throw new DashboardError(500, "DATABASE_NOT_CONFIGURED", "DATABASE_URL is not configured.");
  }

  database = createDatabaseClient({
    url,
    maxConnections: 3,
  });

  return database;
}

function getApiKeyHashSecret(): string {
  const secret = webEnv.API_KEY_HASH_SECRET;

  if (!secret || secret.length < 32) {
    throw new DashboardError(
      500,
      "API_KEY_HASH_SECRET_NOT_CONFIGURED",
      "API_KEY_HASH_SECRET must be at least 32 characters.",
    );
  }

  return secret;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isPlanSlug(value: unknown): value is PlanSlug {
  return typeof value === "string" && PLAN_SLUGS.includes(value as PlanSlug);
}

function isContextEffort(value: unknown): value is ContextEffort {
  return typeof value === "string" && CONTEXT_EFFORTS.includes(value as ContextEffort);
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && PLATFORMS.includes(value as Platform);
}

function parseCallerMaxCreditMicros(value: unknown): bigint | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "number") {
    throw new DashboardError(400, "INVALID_MAX_CREDITS", "Max credits must be a number.");
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new DashboardError(
      400,
      "INVALID_MAX_CREDITS",
      "Max credits must be a non-negative finite number.",
    );
  }

  const maximumCredits = creditMicrocreditsToDisplayNumber(
    EFFORT_PROFILES.auto.maximumCreditMicros,
  );

  if (value > maximumCredits) {
    throw new DashboardError(
      400,
      "INVALID_MAX_CREDITS",
      `Max credits must be greater than 0 and no more than ${maximumCredits}.`,
    );
  }

  let creditMicros: bigint;

  try {
    creditMicros = creditDecimalToMicrocredits(value);
  } catch {
    throw new DashboardError(
      400,
      "INVALID_MAX_CREDITS",
      "Max credits must use no more than 6 decimal places.",
    );
  }

  if (creditMicros <= 0n || creditMicros > EFFORT_PROFILES.auto.maximumCreditMicros) {
    throw new DashboardError(
      400,
      "INVALID_MAX_CREDITS",
      `Max credits must be greater than 0 and no more than ${maximumCredits}.`,
    );
  }

  return creditMicros;
}

function displayNameFromUser(user: User): string | null {
  const names = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return names || null;
}

function emailFromUser(user: User): string | null {
  return user.email;
}

function mapApiKey(row: ApiKeySelectRow): DashboardApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    maxEffort: row.max_effort,
    monthlyCreditLimit:
      row.monthly_credit_limit_microcredits === null
        ? null
        : creditMicrocreditsToDisplayNumber(BigInt(row.monthly_credit_limit_microcredits)),
    monthToDateCredits: creditMicrocreditsToDisplayNumber(BigInt(row.month_to_date_microcredits)),
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: row.created_at.toISOString(),
  };
}

function requestStatusFromError(
  reason: Exclude<ReturnType<typeof authorizeUsage>, { allowed: true }>["reason"],
): DashboardError {
  if (reason === "monthly_limit") {
    return new DashboardError(
      402,
      "MONTHLY_CREDIT_LIMIT_EXCEEDED",
      "API key monthly credit limit would be exceeded.",
    );
  }

  if (reason === "credits") {
    return new DashboardError(402, "INSUFFICIENT_CREDITS", "Insufficient account credits.");
  }

  if (reason === "caller_cap") {
    return new DashboardError(
      400,
      "BUDGET_TOO_LOW",
      "Max credits cannot fund the minimum safe work for this effort.",
    );
  }

  return new DashboardError(
    403,
    "EFFORT_NOT_ALLOWED",
    "Requested effort exceeds this API key's maximum effort.",
  );
}

function createContextRequestId(): string {
  return `ctx_${randomBytes(16).toString("base64url")}`;
}

function getWorkerUrl(): string {
  const workerUrl = webEnv.WORKER_URL;

  if (!workerUrl) {
    throw new DashboardError(500, "WORKER_NOT_CONFIGURED", "WORKER_URL is not configured.");
  }

  return workerUrl.replace(/\/$/, "");
}

async function runWorkerContextJob(requestId: string): Promise<void> {
  const internalToken = webEnv.WORKER_INTERNAL_TOKEN;

  if (webEnv.NODE_ENV === "production" && !internalToken) {
    throw new DashboardError(
      500,
      "WORKER_NOT_CONFIGURED",
      "WORKER_INTERNAL_TOKEN is required in production.",
    );
  }

  const response = await fetch(
    `${getWorkerUrl()}/v1/jobs/context/${encodeURIComponent(requestId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(internalToken ? { "x-supacontext-worker-token": internalToken } : {}),
      },
      body: JSON.stringify({ requestId }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    status?: string;
    error?: {
      code?: string;
      message?: string;
    };
  };

  if (!response.ok) {
    throw new DashboardError(
      502,
      "WORKER_FAILED",
      "Context worker failed to process the playground request.",
    );
  }

  if (data.status === "failed") {
    return;
  }
}

function mapUsageRequest(row: UsageRequestRow): UsageRequest {
  const latencyMs =
    row.started_at && row.completed_at
      ? row.completed_at.getTime() - row.started_at.getTime()
      : null;
  const usage =
    row.response_json && typeof row.response_json === "object" && "usage" in row.response_json
      ? (row.response_json as { usage?: { cached?: boolean; sources_used?: number } }).usage
      : undefined;

  return {
    id: row.id,
    keyName: row.key_name,
    query: row.query,
    effort: row.effort,
    resolvedEffort: row.resolved_effort,
    platforms: row.platforms,
    status: row.status,
    creditsCharged: creditMicrocreditsToDisplayNumber(BigInt(row.spent_microcredits)),
    creditsReserved: creditMicrocreditsToDisplayNumber(BigInt(row.reserved_microcredits)),
    sourcesUsed: usage?.sources_used ?? row.citation_count ?? 0,
    cached: usage?.cached ?? false,
    latencyMs: latencyMs !== null && latencyMs >= 0 ? latencyMs : null,
    error: row.error_message ?? row.error_code,
    resultJson: row.response_json,
    createdAt: row.created_at.toISOString(),
  };
}

async function ensureWorkspaceForUser(input: {
  workosUserId: string;
  email: string | null;
  displayName: string | null;
}): Promise<WorkspaceContext> {
  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const profileRows = await transaction<Array<{ id: string }>>`
      insert into profiles (workos_user_id, email, display_name)
      values (${input.workosUserId}, ${input.email}, ${input.displayName})
      on conflict (workos_user_id) do update
      set
        email = excluded.email,
        display_name = excluded.display_name
      returning id
    `;
    const profileId = profileRows[0]?.id;

    if (!profileId) {
      throw new DashboardError(500, "PROFILE_CREATE_FAILED", "Could not create profile.");
    }

    let workspaceId = (
      await transaction<Array<{ id: string }>>`
        select id
        from workspaces
        where owner_profile_id = ${profileId}
        order by created_at asc
        limit 1
      `
    )[0]?.id;

    if (!workspaceId) {
      const workspaceRows = await transaction<Array<{ id: string }>>`
        insert into workspaces (owner_profile_id, name)
        values (${profileId}, ${input.displayName ? `${input.displayName}'s workspace` : "My workspace"})
        returning id
      `;

      workspaceId = workspaceRows[0]?.id;
    }

    if (!workspaceId) {
      throw new DashboardError(500, "WORKSPACE_CREATE_FAILED", "Could not create workspace.");
    }

    await transaction`
      insert into subscriptions (
        workspace_id,
        plan_slug,
        status,
        current_period_start
      )
      select
        ${workspaceId},
        'free'::plan_slug,
        'trialing'::subscription_status,
        now()
      where not exists (
        select 1
        from subscriptions
        where workspace_id = ${workspaceId}
      )
    `;

    await transaction`
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
        ${(BigInt(PLANS.free.includedCredits) * CREDIT_MICROS).toString()},
        ${`trial-grant:${workspaceId}`},
        ${transaction.json({ plan: "free", source: "dashboard_signup" })}
      )
      on conflict (workspace_id, idempotency_key)
      where idempotency_key is not null
      do nothing
    `;

    return {
      profileId,
      workspaceId,
      workosUserId: input.workosUserId,
      email: input.email,
      displayName: input.displayName,
    };
  });
}

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const { user } = await withAuth();

  if (!user) {
    return null;
  }

  return getWorkspaceContextForUser(user);
}

export async function getWorkspaceContextForUser(user: User): Promise<WorkspaceContext> {
  return ensureWorkspaceForUser({
    workosUserId: user.id,
    email: emailFromUser(user),
    displayName: displayNameFromUser(user),
  });
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const workspace = await getWorkspaceContext();

  if (!workspace) {
    redirect("/sign-in");
  }

  return workspace;
}

export async function getPlanState(workspaceId: string): Promise<DashboardPlanState> {
  const sql = getDatabase();
  const rows = await sql<PlanRow[]>`
    select plan_slug, billing_interval, status, current_period_end, cancel_at_period_end
    from subscriptions
    where workspace_id = ${workspaceId}
      and status in ('trialing', 'active', 'past_due')
    order by
      case when status = 'active' then 0 when status = 'trialing' then 1 else 2 end,
      created_at desc
    limit 1
  `;
  const row = rows[0];
  const slug = row?.plan_slug && isPlanSlug(row.plan_slug) ? row.plan_slug : "free";
  const plan = PLANS[slug];

  return {
    slug,
    name: plan.name,
    includedCredits: plan.includedCredits,
    priceCents: plan.priceCents,
    annualPriceCents: plan.annualPriceCents,
    billingInterval: row?.billing_interval ?? null,
    status: row?.status ?? "trialing",
    renewalDate: toIso(row?.current_period_end ?? null),
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
  };
}

export async function getCreditBalance(workspaceId: string): Promise<number> {
  const sql = getDatabase();
  const rows = await sql<Array<{ balance_microcredits: string }>>`
    select balance_microcredits::text
    from credit_balances
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return creditMicrocreditsToDisplayNumber(BigInt(rows[0]?.balance_microcredits ?? "0"));
}

export async function getMonthUsage(workspaceId: string): Promise<number> {
  const sql = getDatabase();
  const rows = await sql<Array<{ spent_microcredits: string }>>`
    select coalesce(sum(spent_microcredits), 0)::text as spent_microcredits
    from context_requests
    where workspace_id = ${workspaceId}
      and settled_at >= date_trunc('month', now())
  `;

  return creditMicrocreditsToDisplayNumber(BigInt(rows[0]?.spent_microcredits ?? "0"));
}

export async function listApiKeys(workspaceId: string): Promise<DashboardApiKey[]> {
  const sql = getDatabase();
  const rows = await sql<ApiKeySelectRow[]>`
    select
      id,
      name,
      prefix,
      max_effort,
      monthly_credit_limit_microcredits::text,
      month_to_date_microcredits::text,
      last_used_at,
      revoked_at,
      created_at
    from api_keys
    where workspace_id = ${workspaceId}
    order by created_at desc
  `;

  return rows.map(mapApiKey);
}

export async function listRecentRequests(workspaceId: string, limit = 5): Promise<UsageRequest[]> {
  const sql = getDatabase();
  const rows = await sql<UsageRequestRow[]>`
    select
      context_requests.id,
      api_keys.name as key_name,
      context_requests.query,
      context_requests.effort,
      context_requests.resolved_effort,
      context_requests.platforms,
      context_requests.status,
      context_requests.reserved_microcredits::text,
      context_requests.spent_microcredits::text,
      context_requests.error_code,
      context_requests.error_message,
      context_requests.started_at,
      context_requests.completed_at,
      context_requests.created_at,
      context_results.response_json,
      context_results.citation_count
    from context_requests
    left join api_keys on api_keys.id = context_requests.api_key_id
    left join context_results on context_results.context_request_id = context_requests.id
    where context_requests.workspace_id = ${workspaceId}
    order by context_requests.created_at desc
    limit ${limit}
  `;

  return rows.map(mapUsageRequest);
}

export async function listUsageRequests(
  workspaceId: string,
  filters: UsageFilters = {},
): Promise<UsageRequest[]> {
  const sql = getDatabase();
  const keyFilter = filters.keyId ? sql`and context_requests.api_key_id = ${filters.keyId}` : sql``;
  const effortFilter = filters.effort
    ? sql`and context_requests.effort = ${filters.effort}::context_effort`
    : sql``;
  const statusFilter = filters.status
    ? sql`and context_requests.status = ${filters.status}::request_status`
    : sql``;
  const fromFilter = filters.from ? sql`and context_requests.created_at >= ${filters.from}` : sql``;
  const toFilter = filters.to
    ? sql`and context_requests.created_at < (${filters.to}::date + interval '1 day')`
    : sql``;
  const rows = await sql<UsageRequestRow[]>`
    select
      context_requests.id,
      api_keys.name as key_name,
      context_requests.query,
      context_requests.effort,
      context_requests.resolved_effort,
      context_requests.platforms,
      context_requests.status,
      context_requests.reserved_microcredits::text,
      context_requests.spent_microcredits::text,
      context_requests.error_code,
      context_requests.error_message,
      context_requests.started_at,
      context_requests.completed_at,
      context_requests.created_at,
      context_results.response_json,
      context_results.citation_count
    from context_requests
    left join api_keys on api_keys.id = context_requests.api_key_id
    left join context_results on context_results.context_request_id = context_requests.id
    where context_requests.workspace_id = ${workspaceId}
      ${keyFilter}
      ${effortFilter}
      ${statusFilter}
      ${fromFilter}
      ${toFilter}
    order by context_requests.created_at desc
    limit 100
  `;

  return rows.map(mapUsageRequest);
}

export async function createDashboardApiKey(
  workspace: WorkspaceContext,
  input: unknown,
): Promise<{ key: DashboardApiKey; rawKey: string }> {
  const parsed = parseApiKeyForm(
    input && typeof input === "object"
      ? {
          name: (input as { name?: unknown }).name,
          monthlyCreditLimit: (input as { monthlyCreditLimit?: unknown }).monthlyCreditLimit,
          maxEffort: (input as { maxEffort?: unknown }).maxEffort,
        }
      : { name: "", maxEffort: "" },
  );

  if (!parsed.ok) {
    throw new DashboardError(
      400,
      "INVALID_KEY_FORM",
      parsed.errors[0]?.message ?? "Invalid API key form.",
    );
  }

  const sql = getDatabase();
  const material = createApiKeyMaterial(getApiKeyHashSecret());
  const rows = await sql<ApiKeySelectRow[]>`
    insert into api_keys (
      workspace_id,
      created_by_profile_id,
      name,
      key_hash,
      prefix,
      max_effort,
      monthly_credit_limit_microcredits
    )
    values (
      ${workspace.workspaceId},
      ${workspace.profileId},
      ${parsed.value.name},
      ${material.hash},
      ${material.prefix},
      ${parsed.value.maxEffort}::context_effort,
      ${
        parsed.value.monthlyCreditLimit === null
          ? null
          : (BigInt(parsed.value.monthlyCreditLimit) * CREDIT_MICROS).toString()
      }
    )
    returning
      id,
      name,
      prefix,
      max_effort,
      monthly_credit_limit_microcredits::text,
      month_to_date_microcredits::text,
      last_used_at,
      revoked_at,
      created_at
  `;
  const row = rows[0];

  if (!row) {
    throw new DashboardError(500, "API_KEY_CREATE_FAILED", "Could not create API key.");
  }

  return {
    key: mapApiKey(row),
    rawKey: material.rawKey,
  };
}

export async function revokeDashboardApiKey(workspaceId: string, apiKeyId: string): Promise<void> {
  const sql = getDatabase();
  const rows = await sql<Array<{ id: string }>>`
    update api_keys
    set revoked_at = now()
    where id = ${apiKeyId}
      and workspace_id = ${workspaceId}
      and revoked_at is null
    returning id
  `;

  if (!rows[0]) {
    throw new DashboardError(404, "API_KEY_NOT_FOUND", "API key not found.");
  }
}

export async function runPlaygroundRequest(
  workspace: WorkspaceContext,
  input: unknown,
): Promise<PublicContextResponse> {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const effort = body.effort === undefined ? "medium" : body.effort;
  const callerMaxCreditMicros = parseCallerMaxCreditMicros(body.max_credits);
  const hasManualPlatforms = body.platforms !== undefined;
  const platforms = Array.isArray(body.platforms) ? body.platforms : [...PLATFORMS];

  if (!query) {
    throw new DashboardError(400, "QUERY_REQUIRED", "Query is required.");
  }

  if (
    (hasManualPlatforms && !Array.isArray(body.platforms)) ||
    platforms.length === 0 ||
    platforms.some((platform) => !isPlatform(platform)) ||
    new Set(platforms).size !== platforms.length
  ) {
    throw new DashboardError(400, "INVALID_PLATFORMS", "Choose at least one unique platform.");
  }

  if (query.length > 4000) {
    throw new DashboardError(400, "QUERY_TOO_LONG", "Query must be 4000 characters or fewer.");
  }

  if (!isContextEffort(effort)) {
    throw new DashboardError(400, "INVALID_EFFORT", "Choose a supported effort.");
  }

  const selectedPlatforms = platforms as Platform[];

  const sql = getDatabase();

  const requestId = await sql.begin(async (transaction) => {
    const apiKeyRows = await transaction<PlaygroundApiKeyRow[]>`
      select
        id,
        max_effort,
        monthly_credit_limit_microcredits::text,
        month_to_date_microcredits::text
      from api_keys
      where workspace_id = ${workspace.workspaceId}
        and revoked_at is null
      order by created_at asc
      limit 1
      for update
    `;
    const apiKey = apiKeyRows[0];

    if (!apiKey) {
      throw new DashboardError(
        400,
        "API_KEY_REQUIRED",
        "Create an API key before running the playground.",
      );
    }

    const balanceRows = await transaction<Array<{ balance_microcredits: string }>>`
      select balance_microcredits::text
      from credit_balances
      where workspace_id = ${workspace.workspaceId}
      for update
    `;
    const authorization = authorizeUsage({
      effort,
      balanceCreditMicros: BigInt(balanceRows[0]?.balance_microcredits ?? "0"),
      callerMaxCreditMicros,
      apiKeyMaxEffort: apiKey.max_effort,
      monthlyCreditLimitMicros:
        apiKey.monthly_credit_limit_microcredits === null
          ? null
          : BigInt(apiKey.monthly_credit_limit_microcredits),
      monthToDateCreditMicros: BigInt(apiKey.month_to_date_microcredits),
    });

    if (!authorization.allowed) {
      throw requestStatusFromError(authorization.reason);
    }

    const createdRequestId = createContextRequestId();
    const resolvedEffort = effort === "auto" ? null : effort;

    await transaction`
      insert into context_requests (
        id,
        workspace_id,
        api_key_id,
        query,
        effort,
        resolved_effort,
        max_resolved_effort,
        platforms,
        platform_mode,
        status,
        caller_max_microcredits,
        effective_cap_microcredits,
        reserved_microcredits,
        spent_microcredits,
        pricing_version,
        metadata
      )
      values (
        ${createdRequestId},
        ${workspace.workspaceId},
        ${apiKey.id},
        ${query},
        ${effort}::context_effort,
        ${resolvedEffort}::context_effort,
        ${apiKey.max_effort}::context_effort,
        ${selectedPlatforms}::platform[],
        ${hasManualPlatforms ? "manual" : "auto"},
        'queued'::request_status,
        ${callerMaxCreditMicros?.toString() ?? null},
        ${authorization.reservationCreditMicros.toString()},
        ${authorization.reservationCreditMicros.toString()},
        0,
        ${PRICING_VERSION},
        ${transaction.json({ source: "dashboard_playground" })}
      )
    `;

    await transaction`
      insert into usage_ledger (
        workspace_id,
        event_type,
        credit_microcredits,
        context_request_id,
        idempotency_key,
        metadata
      )
      values (
        ${workspace.workspaceId},
        'reservation'::ledger_event_type,
        ${(authorization.reservationCreditMicros * -1n).toString()},
        ${createdRequestId},
        ${`reservation:${createdRequestId}`},
        ${transaction.json({ api_key_id: apiKey.id, effort, pricing_version: PRICING_VERSION })}
      )
    `;

    await transaction`
      update api_keys
      set
        month_to_date_microcredits =
          month_to_date_microcredits + ${authorization.reservationCreditMicros.toString()},
        last_used_at = now()
      where id = ${apiKey.id}
    `;

    return createdRequestId;
  });

  try {
    await runWorkerContextJob(requestId);
  } catch (error) {
    await failPlaygroundRequest(
      requestId,
      "WORKER_UNAVAILABLE",
      error instanceof Error
        ? error.message
        : "Context worker failed to process the playground request.",
    );
    const completed = await getStoredPlaygroundRequest(workspace.workspaceId, requestId);

    if (completed?.status === "completed") {
      return completed;
    }

    throw error;
  }

  const result = await getStoredPlaygroundRequest(workspace.workspaceId, requestId);

  if (!result) {
    throw new DashboardError(
      500,
      "PLAYGROUND_RESULT_NOT_FOUND",
      "Worker completed without a stored result.",
    );
  }

  return result;
}

async function failPlaygroundRequest(
  requestId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const sql = getDatabase();

  await sql.begin(async (transaction) => {
    const rows = await transaction<
      Array<{
        workspace_id: string;
        api_key_id: string | null;
        effective_cap_microcredits: string;
        settled_at: Date | null;
        status: RequestStatus;
      }>
    >`
      select
        workspace_id,
        api_key_id,
        effective_cap_microcredits::text,
        settled_at,
        status
      from context_requests
      where id = ${requestId}
      for update
    `;
    const request = rows[0];

    if (!request || request.settled_at || request.status === "completed") {
      return;
    }

    await transaction`
      update context_cost_events
      set
        status = 'uncertain',
        actual_microcredits = reserved_microcredits,
        settled_at = coalesce(settled_at, now())
      where context_request_id = ${requestId}
        and status = 'pending'
    `;

    const committedRows = await transaction<Array<{ committed_microcredits: string }>>`
      select coalesce(sum(
        case
          when status in ('pending', 'uncertain') then reserved_microcredits
          when status = 'settled' then coalesce(actual_microcredits, reserved_microcredits)
          else 0
        end
      ), 0)::text as committed_microcredits
      from context_cost_events
      where context_request_id = ${requestId}
    `;
    const cap = BigInt(request.effective_cap_microcredits);
    const measured = BigInt(committedRows[0]?.committed_microcredits ?? "0");
    const actual = measured > cap ? cap : measured;
    const release = cap - actual;

    await transaction`
      update context_requests
      set
        status = 'failed',
        settled_at = now(),
        lease_expires_at = null,
        reserved_microcredits = 0,
        spent_microcredits = ${actual.toString()},
        error_code = ${errorCode},
        error_message = ${errorMessage},
        completed_at = now()
      where id = ${requestId}
        and status <> 'completed'
    `;

    if (release <= 0n) {
      return;
    }

    const releaseRows = await transaction<Array<{ id: string }>>`
      insert into usage_ledger (
        workspace_id,
        event_type,
        credit_microcredits,
        context_request_id,
        idempotency_key,
        metadata
      )
      values (
        ${request.workspace_id},
        'release'::ledger_event_type,
        ${release.toString()},
        ${requestId},
        ${`release:${requestId}`},
        ${transaction.json({ reason: errorCode, pricing_version: PRICING_VERSION })}
      )
      on conflict (workspace_id, idempotency_key)
      where idempotency_key is not null
      do nothing
      returning id
    `;

    if (releaseRows[0] && request.api_key_id) {
      await transaction`
        update api_keys
        set month_to_date_microcredits = greatest(
          0,
          month_to_date_microcredits - ${release.toString()}
        )
        where id = ${request.api_key_id}
      `;
    }
  });
}

export async function getStoredPlaygroundRequest(
  workspaceId: string,
  requestId: string,
): Promise<PublicContextResponse | null> {
  const sql = getDatabase();
  const rows = await sql<
    Array<{
      id: string;
      query: string;
      effort: ContextEffort;
      resolved_effort: ResolvedEffort | null;
      platforms: Platform[];
      status: RequestStatus;
      reserved_microcredits: string;
      spent_microcredits: string;
      response_json: unknown | null;
    }>
  >`
    select
      context_requests.id,
      context_requests.query,
      context_requests.effort,
      context_requests.resolved_effort,
      context_requests.platforms,
      context_requests.status,
      context_requests.reserved_microcredits::text,
      context_requests.spent_microcredits::text,
      context_results.response_json
    from context_requests
    left join context_results on context_results.context_request_id = context_requests.id
    where context_requests.workspace_id = ${workspaceId}
      and context_requests.id = ${requestId}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const result =
    row.response_json && typeof row.response_json === "object"
      ? (row.response_json as {
          answer?: string | null;
          context_pack?: unknown[];
          sources?: unknown[];
          gaps?: unknown[];
          usage?: PublicContextResponse["usage"];
        })
      : {};
  const creditsCharged = creditMicrocreditsToDisplayNumber(BigInt(row.spent_microcredits));
  const creditsReserved = creditMicrocreditsToDisplayNumber(BigInt(row.reserved_microcredits));
  const usage = result.usage ?? {
    credits_charged: creditsCharged,
    credits_reserved: creditsReserved,
    effort: row.effort,
    ...(row.resolved_effort ? { resolved_effort: row.resolved_effort } : {}),
    platforms_used: row.platforms,
    sources_considered: 0,
    sources_used: 0,
    cached: false,
  };

  return {
    id: row.id,
    query: row.query,
    effort: row.effort,
    ...(row.resolved_effort ? { resolved_effort: row.resolved_effort } : {}),
    status: row.status,
    answer: result.answer ?? null,
    context_pack: result.context_pack ?? [],
    sources: result.sources ?? [],
    gaps: result.gaps ?? [],
    usage: {
      ...usage,
      credits_charged: creditsCharged,
      credits_reserved: creditsReserved,
      effort: row.effort,
      ...(row.resolved_effort ? { resolved_effort: row.resolved_effort } : {}),
    },
  };
}

export function parseUsageFilters(
  input: Record<string, string | string[] | undefined>,
): UsageFilters {
  const filters: UsageFilters = {};
  const effort = Array.isArray(input.effort) ? input.effort[0] : input.effort;
  const status = Array.isArray(input.status) ? input.status[0] : input.status;
  const keyId = Array.isArray(input.key) ? input.key[0] : input.key;
  const from = Array.isArray(input.from) ? input.from[0] : input.from;
  const to = Array.isArray(input.to) ? input.to[0] : input.to;

  if (effort && isContextEffort(effort)) {
    filters.effort = effort;
  }

  if (status && ["queued", "running", "completed", "failed", "cancelled"].includes(status)) {
    filters.status = status as RequestStatus;
  }

  if (keyId) {
    filters.keyId = keyId;
  }

  if (from) {
    filters.from = from;
  }

  if (to) {
    filters.to = to;
  }

  return filters;
}

export async function createBillingCheckout(
  workspaceId: string,
  plan: PaidPlanSlug,
  billingInterval: PaidBillingInterval,
): Promise<string> {
  try {
    return await createCreemCheckout(workspaceId, plan, billingInterval);
  } catch (error) {
    console.error(error);
    throw new DashboardError(501, "BILLING_NOT_CONFIGURED", "Billing checkout is not available.");
  }
}

export async function createBillingPortal(workspaceId: string): Promise<string> {
  try {
    return await createCreemPortal(workspaceId);
  } catch (error) {
    console.error(error);
    throw new DashboardError(
      501,
      "BILLING_PORTAL_NOT_AVAILABLE",
      "Billing portal is not available.",
    );
  }
}

export function parsePaidPlan(value: unknown): PaidPlanSlug | null {
  return isPaidPlan(value) ? value : null;
}

export function parsePaidBillingInterval(value: unknown): PaidBillingInterval | null {
  return value === "month" || value === "year" ? value : null;
}
