import "server-only";

import { randomBytes } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { BillingNotImplementedError, CreemBillingClient, type PaidPlanSlug } from "@supacontext/billing";
import {
  CONTEXT_DEPTHS,
  PLANS,
  PLAN_SLUGS,
  PLATFORMS,
  createApiKeyMaterial,
  type ContextDepth,
  type Platform,
  type PlanSlug,
  type PublicContextResponse,
  type RequestStatus,
} from "@supacontext/core";
import { createDatabaseClient, type ApiKeyRow, type DatabaseClient } from "@supacontext/db";
import { authorizeUsage } from "@supacontext/usage";
import { redirect } from "next/navigation";
import { parseApiKeyForm } from "../api-key-form";

let database: DatabaseClient | undefined;

export type WorkspaceContext = {
  profileId: string;
  workspaceId: string;
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
};

export type DashboardApiKey = {
  id: string;
  name: string;
  prefix: string;
  maxDepth: ContextDepth;
  monthlyCreditLimit: number | null;
  monthToDateCredits: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DashboardPlanState = {
  slug: PlanSlug;
  name: string;
  includedCredits: number;
  priceCents: number;
  status: string;
  renewalDate: string | null;
};

export type UsageRequest = {
  id: string;
  keyName: string | null;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  status: RequestStatus;
  creditsCharged: number;
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
  depth?: ContextDepth;
  status?: RequestStatus;
};

type PlanRow = {
  plan_slug: PlanSlug;
  status: string;
  current_period_end: Date | null;
};

type ApiKeySelectRow = {
  id: string;
  name: string;
  prefix: string;
  max_depth: ContextDepth;
  monthly_credit_limit: number | null;
  month_to_date_credits: number;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

type UsageRequestRow = {
  id: string;
  key_name: string | null;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  status: RequestStatus;
  spent_credits: number;
  error_code: string | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  response_json: unknown | null;
  citation_count: number | null;
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

  const url = process.env.DATABASE_URL;

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
  const secret = process.env.API_KEY_HASH_SECRET;

  if (!secret || secret.length < 32) {
    throw new DashboardError(
      500,
      "API_KEY_HASH_SECRET_NOT_CONFIGURED",
      "API_KEY_HASH_SECRET must be at least 32 characters.",
    );
  }

  return secret;
}

function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isPlanSlug(value: unknown): value is PlanSlug {
  return typeof value === "string" && PLAN_SLUGS.includes(value as PlanSlug);
}

function isContextDepth(value: unknown): value is ContextDepth {
  return typeof value === "string" && CONTEXT_DEPTHS.includes(value as ContextDepth);
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && PLATFORMS.includes(value as Platform);
}

function displayNameFromUser(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) {
    return null;
  }

  const names = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return names || user.username || user.fullName || null;
}

function emailFromUser(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
}

function mapApiKey(row: ApiKeySelectRow): DashboardApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    maxDepth: row.max_depth,
    monthlyCreditLimit: row.monthly_credit_limit,
    monthToDateCredits: row.month_to_date_credits,
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: row.created_at.toISOString(),
  };
}

function requestStatusFromError(reason: Exclude<ReturnType<typeof authorizeUsage>, { allowed: true }>["reason"]): DashboardError {
  if (reason === "monthly_limit") {
    return new DashboardError(402, "MONTHLY_CREDIT_LIMIT_EXCEEDED", "API key monthly credit limit would be exceeded.");
  }

  if (reason === "credits") {
    return new DashboardError(402, "INSUFFICIENT_CREDITS", "Insufficient account credits.");
  }

  return new DashboardError(403, "DEPTH_NOT_ALLOWED", "Requested depth is not allowed for this API key or plan.");
}

function createContextRequestId(): string {
  return `ctx_${randomBytes(16).toString("base64url")}`;
}

function createPlaygroundResult(input: {
  id: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  creditsCharged: number;
}): PublicContextResponse {
  const sources = input.platforms.map((platform, index) => ({
    id: `src_${index + 1}`,
    platform,
    title: `${platform} context placeholder`,
    url: `https://example.com/supacontext/${platform}`,
    published_at: null,
    summary: "Provider-backed retrieval is not configured in this local dashboard flow yet.",
  }));

  return {
    id: input.id,
    query: input.query,
    depth: input.depth,
    status: "completed",
    answer: `Dashboard playground context for "${input.query}". This structured JSON response uses the same public shape as the API while provider retrieval is being configured.`,
    context_pack: [
      {
        claim: "The dashboard authenticated the user, selected an owned API key, charged credits, and stored the request.",
        confidence: "high",
        supporting_sources: sources.map((source) => source.id),
      },
    ],
    sources,
    gaps: ["Connect provider credentials and the worker pipeline to replace this local placeholder result."],
    usage: {
      credits_charged: input.creditsCharged,
      depth: input.depth,
      platforms_used: input.platforms,
      sources_considered: sources.length,
      sources_used: sources.length,
      cached: false,
    },
  };
}

function mapUsageRequest(row: UsageRequestRow): UsageRequest {
  const latencyMs =
    row.started_at && row.completed_at ? row.completed_at.getTime() - row.started_at.getTime() : null;
  const usage =
    row.response_json && typeof row.response_json === "object" && "usage" in row.response_json
      ? (row.response_json as { usage?: { cached?: boolean; sources_used?: number } }).usage
      : undefined;

  return {
    id: row.id,
    keyName: row.key_name,
    query: row.query,
    depth: row.depth,
    platforms: row.platforms,
    status: row.status,
    creditsCharged: row.spent_credits,
    sourcesUsed: usage?.sources_used ?? row.citation_count ?? 0,
    cached: usage?.cached ?? false,
    latencyMs: latencyMs !== null && latencyMs >= 0 ? latencyMs : null,
    error: row.error_message ?? row.error_code,
    resultJson: row.response_json,
    createdAt: row.created_at.toISOString(),
  };
}

async function ensureWorkspaceForUser(input: {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}): Promise<WorkspaceContext> {
  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const profileRows = await transaction<Array<{ id: string }>>`
      insert into profiles (clerk_user_id, email, display_name)
      values (${input.clerkUserId}, ${input.email}, ${input.displayName})
      on conflict (clerk_user_id) do update
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
        'trial'::plan_slug,
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
        credits,
        idempotency_key,
        metadata
      )
      values (
        ${workspaceId},
        'grant'::ledger_event_type,
        ${PLANS.trial.includedCredits},
        ${`trial-grant:${workspaceId}`},
        ${transaction.json({ plan: "trial", source: "dashboard_signup" })}
      )
      on conflict (workspace_id, idempotency_key)
      where idempotency_key is not null
      do nothing
    `;

    return {
      profileId,
      workspaceId,
      clerkUserId: input.clerkUserId,
      email: input.email,
      displayName: input.displayName,
    };
  });
}

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const session = await auth();

  if (!session.userId) {
    return null;
  }

  const user = await currentUser();

  return ensureWorkspaceForUser({
    clerkUserId: session.userId,
    email: emailFromUser(user),
    displayName: displayNameFromUser(user),
  });
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const context = await getWorkspaceContext();

  if (!context) {
    redirect("/sign-in");
  }

  return context;
}

export async function getPlanState(workspaceId: string): Promise<DashboardPlanState> {
  const sql = getDatabase();
  const rows = await sql<PlanRow[]>`
    select plan_slug, status, current_period_end
    from subscriptions
    where workspace_id = ${workspaceId}
      and status in ('trialing', 'active', 'past_due')
    order by
      case when status = 'active' then 0 when status = 'trialing' then 1 else 2 end,
      created_at desc
    limit 1
  `;
  const row = rows[0];
  const slug = row?.plan_slug && isPlanSlug(row.plan_slug) ? row.plan_slug : "trial";
  const plan = PLANS[slug];

  return {
    slug,
    name: plan.name,
    includedCredits: plan.includedCredits,
    priceCents: plan.priceCents,
    status: row?.status ?? "trialing",
    renewalDate: toIso(row?.current_period_end ?? null),
  };
}

export async function getCreditBalance(workspaceId: string): Promise<number> {
  const sql = getDatabase();
  const rows = await sql<Array<{ balance: number }>>`
    select balance
    from credit_balances
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return rows[0]?.balance ?? 0;
}

export async function getMonthUsage(workspaceId: string): Promise<number> {
  const sql = getDatabase();
  const rows = await sql<Array<{ credits: number }>>`
    select coalesce(sum(abs(credits)), 0)::int as credits
    from usage_ledger
    where workspace_id = ${workspaceId}
      and event_type = 'debit'
      and created_at >= date_trunc('month', now())
  `;

  return rows[0]?.credits ?? 0;
}

export async function listApiKeys(workspaceId: string): Promise<DashboardApiKey[]> {
  const sql = getDatabase();
  const rows = await sql<ApiKeySelectRow[]>`
    select
      id,
      name,
      prefix,
      max_depth,
      monthly_credit_limit,
      month_to_date_credits,
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
      context_requests.depth,
      context_requests.platforms,
      context_requests.status,
      context_requests.spent_credits,
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
  const depthFilter = filters.depth ? sql`and context_requests.depth = ${filters.depth}::context_depth` : sql``;
  const statusFilter = filters.status ? sql`and context_requests.status = ${filters.status}::request_status` : sql``;
  const fromFilter = filters.from ? sql`and context_requests.created_at >= ${filters.from}` : sql``;
  const toFilter = filters.to ? sql`and context_requests.created_at < (${filters.to}::date + interval '1 day')` : sql``;
  const rows = await sql<UsageRequestRow[]>`
    select
      context_requests.id,
      api_keys.name as key_name,
      context_requests.query,
      context_requests.depth,
      context_requests.platforms,
      context_requests.status,
      context_requests.spent_credits,
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
      ${depthFilter}
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
          maxDepth: (input as { maxDepth?: unknown }).maxDepth,
        }
      : { name: "", maxDepth: "" },
  );

  if (!parsed.ok) {
    throw new DashboardError(400, "INVALID_KEY_FORM", parsed.errors[0]?.message ?? "Invalid API key form.");
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
      max_depth,
      monthly_credit_limit
    )
    values (
      ${workspace.workspaceId},
      ${workspace.profileId},
      ${parsed.value.name},
      ${material.hash},
      ${material.prefix},
      ${parsed.value.maxDepth}::context_depth,
      ${parsed.value.monthlyCreditLimit}
    )
    returning
      id,
      name,
      prefix,
      max_depth,
      monthly_credit_limit,
      month_to_date_credits,
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
  const depth = isContextDepth(body.depth) ? body.depth : "standard";
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter(isPlatform)
    : [...PLATFORMS];

  if (!query) {
    throw new DashboardError(400, "QUERY_REQUIRED", "Query is required.");
  }

  if (platforms.length === 0 || new Set(platforms).size !== platforms.length) {
    throw new DashboardError(400, "INVALID_PLATFORMS", "Choose at least one unique platform.");
  }

  if (query.length > 4000) {
    throw new DashboardError(400, "QUERY_TOO_LONG", "Query must be 4000 characters or fewer.");
  }

  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const apiKeyRows = await transaction<ApiKeyRow[]>`
      select
        id,
        workspace_id,
        name,
        key_hash,
        prefix,
        max_depth,
        monthly_credit_limit,
        month_to_date_credits,
        last_used_at,
        revoked_at,
        created_at
      from api_keys
      where workspace_id = ${workspace.workspaceId}
        and revoked_at is null
      order by created_at asc
      limit 1
      for update
    `;
    const apiKey = apiKeyRows[0];

    if (!apiKey) {
      throw new DashboardError(400, "API_KEY_REQUIRED", "Create an API key before running the playground.");
    }

    const plan = await getPlanState(workspace.workspaceId);
    const balanceRows = await transaction<Array<{ balance: number }>>`
      select balance
      from credit_balances
      where workspace_id = ${workspace.workspaceId}
      for update
    `;
    const authorization = authorizeUsage({
      plan: plan.slug,
      depth,
      balance: balanceRows[0]?.balance ?? 0,
      apiKeyMaxDepth: apiKey.max_depth,
      monthlyCreditLimit: apiKey.monthly_credit_limit,
      monthToDateCredits: apiKey.month_to_date_credits,
    });

    if (!authorization.allowed) {
      throw requestStatusFromError(authorization.reason);
    }

    const requestId = createContextRequestId();
    const now = new Date();
    const result = createPlaygroundResult({
      id: requestId,
      query,
      depth,
      platforms,
      creditsCharged: authorization.requiredCredits,
    });
    const resultJson = result as unknown as Parameters<typeof transaction.json>[0];

    await transaction`
      insert into context_requests (
        id,
        workspace_id,
        api_key_id,
        query,
        depth,
        platforms,
        platform_mode,
        status,
        requested_credits,
        spent_credits,
        metadata,
        started_at,
        completed_at
      )
      values (
        ${requestId},
        ${workspace.workspaceId},
        ${apiKey.id},
        ${query},
        ${depth}::context_depth,
        ${platforms}::platform[],
        'manual',
        'completed'::request_status,
        ${authorization.requiredCredits},
        ${authorization.requiredCredits},
        ${transaction.json({ source: "dashboard_playground" })},
        ${now},
        ${now}
      )
    `;

    await transaction`
      insert into context_results (
        context_request_id,
        response_json,
        citation_count
      )
      values (
        ${requestId},
        ${transaction.json(resultJson)},
        ${result.sources.length}
      )
    `;

    await transaction`
      insert into usage_ledger (
        workspace_id,
        event_type,
        credits,
        context_request_id,
        idempotency_key,
        metadata
      )
      values (
        ${workspace.workspaceId},
        'debit'::ledger_event_type,
        ${authorization.requiredCredits * -1},
        ${requestId},
        ${`request:${requestId}`},
        ${transaction.json({ api_key_id: apiKey.id, depth })}
      )
    `;

    await transaction`
      update api_keys
      set
        month_to_date_credits = month_to_date_credits + ${authorization.requiredCredits},
        last_used_at = now()
      where id = ${apiKey.id}
    `;

    return result;
  });
}

export async function getStoredPlaygroundRequest(
  workspaceId: string,
  requestId: string,
): Promise<PublicContextResponse | null> {
  const sql = getDatabase();
  const rows = await sql<Array<{ response_json: unknown }>>`
    select context_results.response_json
    from context_requests
    join context_results on context_results.context_request_id = context_requests.id
    where context_requests.workspace_id = ${workspaceId}
      and context_requests.id = ${requestId}
    limit 1
  `;

  return (rows[0]?.response_json as PublicContextResponse | undefined) ?? null;
}

export function parseUsageFilters(input: Record<string, string | string[] | undefined>): UsageFilters {
  const filters: UsageFilters = {};
  const depth = Array.isArray(input.depth) ? input.depth[0] : input.depth;
  const status = Array.isArray(input.status) ? input.status[0] : input.status;
  const keyId = Array.isArray(input.key) ? input.key[0] : input.key;
  const from = Array.isArray(input.from) ? input.from[0] : input.from;
  const to = Array.isArray(input.to) ? input.to[0] : input.to;

  if (depth && isContextDepth(depth)) {
    filters.depth = depth;
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

export async function createBillingCheckout(workspaceId: string, plan: PaidPlanSlug): Promise<string> {
  if (!process.env.CREEM_API_KEY || process.env.CREEM_API_KEY === "replace_me") {
    throw new DashboardError(501, "BILLING_NOT_CONFIGURED", "Creem is not configured for this environment.");
  }

  const client = new CreemBillingClient();

  try {
    const session = await client.createCheckoutSession({
      workspaceId,
      plan,
      successUrl: `${getAppUrl()}/billing?checkout=success`,
      cancelUrl: `${getAppUrl()}/billing?checkout=cancelled`,
    });

    return session.url;
  } catch (error) {
    if (error instanceof BillingNotImplementedError) {
      throw new DashboardError(501, "BILLING_NOT_IMPLEMENTED", error.message);
    }

    throw error;
  }
}

export function parsePaidPlan(value: unknown): PaidPlanSlug | null {
  if (value === "starter" || value === "builder" || value === "pro" || value === "scale") {
    return value;
  }

  return null;
}
