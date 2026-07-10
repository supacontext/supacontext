import { createHash, randomBytes } from "node:crypto";
import {
  PLAN_RATE_LIMITS,
  PRICING_VERSION,
  RESOLVED_EFFORTS,
  type ContextEffort,
  type Platform,
  type PlatformMode,
  type PlanSlug,
  type ResolvedEffort,
} from "@supacontext/core";
import {
  findActiveApiKeyByHash,
  markApiKeyUsed,
  type ApiKeyRow,
  type DatabaseClient,
} from "@supacontext/db";
import { authorizeUsage, type UsageDenialReason } from "@supacontext/usage";
import type postgres from "postgres";
import { ApiError } from "./errors.js";
import type { StoredContextRequest } from "./public-response.js";

type ContextRequestSelectRow = {
  id: string;
  query: string;
  effort: ContextEffort;
  resolved_effort: ResolvedEffort | null;
  max_resolved_effort: ResolvedEffort;
  platforms: Platform[];
  status: StoredContextRequest["status"];
  effective_cap_microcredits: string;
  reserved_microcredits: string;
  spent_microcredits: string;
  error_code: string | null;
  error_message: string | null;
  response_json: unknown | null;
  idempotency_request_hash?: string | null;
};

export type ContextRequestIdempotencyShape = {
  query: string;
  effort: ContextEffort;
  callerMaxCreditMicros: bigint | null;
  platforms: Platform[];
  platformMode: PlatformMode;
  async: boolean;
  webhookUrl: string | null;
  metadata: Record<string, unknown>;
};

export type AcceptContextRequestInput = ContextRequestIdempotencyShape & {
  apiKey: ApiKeyRow;
  plan: PlanSlug;
  idempotencyKey: string | null;
};

export type AcceptContextRequestResult = {
  request: StoredContextRequest;
  created: boolean;
};

export interface ContextStore {
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null>;
  markApiKeyUsed(apiKeyId: string): Promise<void>;
  getWorkspacePlan(workspaceId: string): Promise<PlanSlug>;
  findRequestById(workspaceId: string, requestId: string): Promise<StoredContextRequest | null>;
  findRequestByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
    idempotencyRequestHash: string,
  ): Promise<StoredContextRequest | null>;
  acceptContextRequest(input: AcceptContextRequestInput): Promise<AcceptContextRequestResult>;
  attachQstashMessageId(requestId: string, messageId: string): Promise<void>;
  failContextRequest(requestId: string, errorCode: string, errorMessage: string): Promise<void>;
  close(): Promise<void>;
}

function createContextRequestId(): string {
  return `ctx_${randomBytes(16).toString("base64url")}`;
}

function stableStringify(value: unknown): string {
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

export function createContextRequestIdempotencyHash(input: ContextRequestIdempotencyShape): string {
  return createHash("sha256")
    .update(
      stableStringify({
        query: input.query,
        effort: input.effort,
        caller_max_microcredits: input.callerMaxCreditMicros,
        platforms: input.platforms,
        platform_mode: input.platformMode,
        async: input.async,
        webhook_url: input.webhookUrl,
        metadata: input.metadata,
      }),
    )
    .digest("hex");
}

function assertIdempotencyRequestHash(row: ContextRequestSelectRow, expectedHash: string): void {
  if (row.idempotency_request_hash !== expectedHash) {
    throw new ApiError(
      409,
      "idempotency_key_conflict",
      "Idempotency-Key was already used with a different request payload.",
    );
  }
}

function mapRequestRow(row: ContextRequestSelectRow): StoredContextRequest {
  return {
    id: row.id,
    query: row.query,
    effort: row.effort,
    resolved_effort: row.resolved_effort,
    max_resolved_effort: row.max_resolved_effort,
    platforms: row.platforms,
    status: row.status,
    effective_cap_microcredits: BigInt(row.effective_cap_microcredits),
    reserved_microcredits: BigInt(row.reserved_microcredits),
    spent_microcredits: BigInt(row.spent_microcredits),
    error_code: row.error_code,
    error_message: row.error_message,
    result:
      row.response_json && typeof row.response_json === "object"
        ? (row.response_json as StoredContextRequest["result"])
        : null,
  };
}

function mapUsageDenial(reason: UsageDenialReason): ApiError {
  if (reason === "api_key_effort_restricted") {
    return new ApiError(
      403,
      "forbidden_effort",
      "Requested effort exceeds this API key's maximum effort.",
    );
  }

  if (reason === "caller_cap") {
    return new ApiError(
      402,
      "budget_too_low",
      "max_credits is below the minimum budget for the requested effort.",
    );
  }

  if (reason === "monthly_limit") {
    return new ApiError(
      402,
      "insufficient_credits",
      "The API key's remaining monthly credit limit cannot fund this effort.",
      { reason: "monthly_limit" },
    );
  }

  return new ApiError(
    402,
    "insufficient_credits",
    "The available balance cannot fund the minimum budget for this effort.",
  );
}

function assertPlanSlug(value: string): PlanSlug {
  if (
    value === "trial" ||
    value === "starter" ||
    value === "builder" ||
    value === "pro" ||
    value === "scale"
  ) {
    return value;
  }

  return "trial";
}

function assertResolvedEffort(value: string): ResolvedEffort {
  if (RESOLVED_EFFORTS.includes(value as ResolvedEffort)) {
    return value as ResolvedEffort;
  }

  throw new Error(`Unknown resolved effort: ${value}`);
}

export class PostgresContextStore implements ContextStore {
  constructor(private readonly sql: DatabaseClient) {}

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    return findActiveApiKeyByHash(this.sql, keyHash);
  }

  async markApiKeyUsed(apiKeyId: string): Promise<void> {
    await markApiKeyUsed(this.sql, apiKeyId);
  }

  async getWorkspacePlan(workspaceId: string): Promise<PlanSlug> {
    const rows = await this.sql<Array<{ plan_slug: string }>>`
      select plan_slug
      from subscriptions
      where workspace_id = ${workspaceId}
        and status in ('trialing', 'active')
      order by
        case when status = 'active' then 0 else 1 end,
        created_at desc
      limit 1
    `;

    return assertPlanSlug(rows[0]?.plan_slug ?? "trial");
  }

  async findRequestById(
    workspaceId: string,
    requestId: string,
  ): Promise<StoredContextRequest | null> {
    return this.findRequest(
      this.sql,
      this.sql`
        where context_requests.workspace_id = ${workspaceId}
          and context_requests.id = ${requestId}
      `,
    );
  }

  async findRequestByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
    idempotencyRequestHash: string,
  ): Promise<StoredContextRequest | null> {
    return this.findRequest(
      this.sql,
      this.sql`
        where context_requests.workspace_id = ${workspaceId}
          and context_requests.idempotency_key = ${idempotencyKey}
      `,
      idempotencyRequestHash,
    );
  }

  async acceptContextRequest(
    input: AcceptContextRequestInput,
  ): Promise<AcceptContextRequestResult> {
    return this.sql.begin(async (transaction) => {
      await this.lockWorkspace(transaction, input.apiKey.workspace_id);
      const idempotencyRequestHash = createContextRequestIdempotencyHash(input);

      if (input.idempotencyKey) {
        const existing = await this.findByIdempotencyKeyInTransaction(
          transaction,
          input.apiKey.workspace_id,
          input.idempotencyKey,
          idempotencyRequestHash,
        );

        if (existing) {
          return { request: existing, created: false };
        }
      }

      await this.enforceConcurrencyInTransaction(transaction, input);
      const apiKey = await this.getApiKeyForUpdate(transaction, input.apiKey.id);
      const balance = await this.getBalanceForUpdate(transaction, input.apiKey.workspace_id);
      const authorization = authorizeUsage({
        effort: input.effort,
        balanceCreditMicros: balance,
        callerMaxCreditMicros: input.callerMaxCreditMicros,
        apiKeyMaxEffort: apiKey.max_effort,
        monthlyCreditLimitMicros: apiKey.monthly_credit_limit_microcredits,
        monthToDateCreditMicros: apiKey.month_to_date_microcredits,
      });

      if (!authorization.allowed) {
        throw mapUsageDenial(authorization.reason);
      }

      const request = await this.insertContextRequest(
        transaction,
        input,
        apiKey.max_effort,
        authorization.reservationCreditMicros,
      );

      if (!request) {
        if (!input.idempotencyKey) {
          throw new Error("Failed to insert context request.");
        }

        const existing = await this.findByIdempotencyKeyInTransaction(
          transaction,
          input.apiKey.workspace_id,
          input.idempotencyKey,
          idempotencyRequestHash,
        );

        if (!existing) {
          throw new Error("Failed to resolve idempotent context request.");
        }

        return { request: existing, created: false };
      }

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
          ${input.apiKey.workspace_id},
          'reservation'::ledger_event_type,
          ${(authorization.reservationCreditMicros * -1n).toString()},
          ${request.id},
          ${`reservation:${request.id}`},
          ${transaction.json({
            api_key_id: input.apiKey.id,
            effort: input.effort,
            pricing_version: PRICING_VERSION,
          })}
        )
      `;

      await transaction`
        update api_keys
        set month_to_date_microcredits =
          month_to_date_microcredits + ${authorization.reservationCreditMicros.toString()}
        where id = ${input.apiKey.id}
      `;

      return { request, created: true };
    });
  }

  async attachQstashMessageId(requestId: string, messageId: string): Promise<void> {
    await this.sql`
      update context_requests
      set qstash_message_id = ${messageId}
      where id = ${requestId}
    `;
  }

  async failContextRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.sql.begin(async (transaction) => {
      const rows = await transaction<
        Array<{
          workspace_id: string;
          api_key_id: string | null;
          effective_cap_microcredits: string;
          settled_at: Date | null;
          status: StoredContextRequest["status"];
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

      const costRows = await transaction<Array<{ actual_microcredits: string }>>`
        select coalesce(sum(
          case
            when status in ('pending', 'uncertain') then reserved_microcredits
            when status = 'settled' then coalesce(actual_microcredits, reserved_microcredits)
            else 0
          end
        ), 0)::text as actual_microcredits
        from context_cost_events
        where context_request_id = ${requestId}
      `;
      const cap = BigInt(request.effective_cap_microcredits);
      const measured = BigInt(costRows[0]?.actual_microcredits ?? "0");
      const actual = measured > cap ? cap : measured;
      const release = cap - actual;

      await transaction`
        update context_requests
        set
          status = 'failed',
          reserved_microcredits = 0,
          spent_microcredits = ${actual.toString()},
          error_code = ${errorCode},
          error_message = ${errorMessage},
          completed_at = now(),
          settled_at = now(),
          lease_expires_at = null
        where id = ${requestId}
      `;

      if (release > 0n) {
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
      }
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async findRequest(
    sql: postgres.Sql | postgres.TransactionSql,
    whereClause: postgres.PendingQuery<postgres.Row[]>,
    idempotencyRequestHash?: string,
  ): Promise<StoredContextRequest | null> {
    const rows = await sql<ContextRequestSelectRow[]>`
      select
        context_requests.id,
        context_requests.query,
        context_requests.effort,
        context_requests.resolved_effort,
        context_requests.max_resolved_effort,
        context_requests.platforms,
        context_requests.status,
        context_requests.effective_cap_microcredits::text,
        context_requests.reserved_microcredits::text,
        context_requests.spent_microcredits::text,
        context_requests.error_code,
        context_requests.error_message,
        context_requests.idempotency_request_hash,
        context_results.response_json
      from context_requests
      left join context_results
        on context_results.context_request_id = context_requests.id
      ${whereClause}
      limit 1
    `;
    const row = rows[0];

    if (!row) {
      return null;
    }

    if (idempotencyRequestHash) {
      assertIdempotencyRequestHash(row, idempotencyRequestHash);
    }

    return mapRequestRow(row);
  }

  private async findByIdempotencyKeyInTransaction(
    transaction: postgres.TransactionSql,
    workspaceId: string,
    idempotencyKey: string,
    idempotencyRequestHash: string,
  ): Promise<StoredContextRequest | null> {
    return this.findRequest(
      transaction,
      transaction`
        where context_requests.workspace_id = ${workspaceId}
          and context_requests.idempotency_key = ${idempotencyKey}
      `,
      idempotencyRequestHash,
    );
  }

  private async getApiKeyForUpdate(
    transaction: postgres.TransactionSql,
    apiKeyId: string,
  ): Promise<ApiKeyRow> {
    const rows = await transaction<
      Array<
        Omit<ApiKeyRow, "monthly_credit_limit_microcredits" | "month_to_date_microcredits"> & {
          monthly_credit_limit_microcredits: string | null;
          month_to_date_microcredits: string;
        }
      >
    >`
      select
        id,
        workspace_id,
        name,
        key_hash,
        prefix,
        max_effort,
        monthly_credit_limit_microcredits::text,
        month_to_date_microcredits::text,
        last_used_at,
        revoked_at,
        created_at
      from api_keys
      where id = ${apiKeyId}
        and revoked_at is null
      for update
    `;
    const row = rows[0];

    if (!row) {
      throw new ApiError(401, "unauthorized", "Invalid API key.");
    }

    return {
      ...row,
      max_effort: assertResolvedEffort(row.max_effort),
      monthly_credit_limit_microcredits:
        row.monthly_credit_limit_microcredits === null
          ? null
          : BigInt(row.monthly_credit_limit_microcredits),
      month_to_date_microcredits: BigInt(row.month_to_date_microcredits),
    };
  }

  private async lockWorkspace(
    transaction: postgres.TransactionSql,
    workspaceId: string,
  ): Promise<void> {
    const rows = await transaction<Array<{ id: string }>>`
      select id
      from workspaces
      where id = ${workspaceId}
      for update
    `;

    if (!rows[0]) {
      throw new Error("Workspace not found.");
    }
  }

  private async enforceConcurrencyInTransaction(
    transaction: postgres.TransactionSql,
    input: AcceptContextRequestInput,
  ): Promise<void> {
    if (!input.async) {
      return;
    }

    const limits = PLAN_RATE_LIMITS[input.plan];
    const activeRows = await transaction<Array<{ count: number }>>`
      select count(*)::int as count
      from context_requests
      where workspace_id = ${input.apiKey.workspace_id}
        and status in ('queued', 'running')
    `;

    if ((activeRows[0]?.count ?? 0) >= limits.concurrentJobs) {
      throw new ApiError(429, "rate_limited", "Concurrent job limit exceeded.");
    }
  }

  private async getBalanceForUpdate(
    transaction: postgres.TransactionSql,
    workspaceId: string,
  ): Promise<bigint> {
    const rows = await transaction<Array<{ balance_microcredits: string }>>`
      select balance_microcredits::text
      from credit_balances
      where workspace_id = ${workspaceId}
      for update
    `;

    return BigInt(rows[0]?.balance_microcredits ?? "0");
  }

  private async insertContextRequest(
    transaction: postgres.TransactionSql,
    input: AcceptContextRequestInput,
    maxResolvedEffort: ResolvedEffort,
    reservationCreditMicros: bigint,
  ): Promise<StoredContextRequest | null> {
    const requestId = createContextRequestId();
    const idempotencyRequestHash = input.idempotencyKey
      ? createContextRequestIdempotencyHash(input)
      : null;
    const resolvedEffort = input.effort === "auto" ? null : input.effort;
    const values = transaction`
      ${requestId},
      ${input.apiKey.workspace_id},
      ${input.apiKey.id},
      ${input.query},
      ${input.effort}::context_effort,
      ${resolvedEffort}::context_effort,
      ${maxResolvedEffort}::context_effort,
      ${input.platforms}::platform[],
      ${input.platformMode},
      'queued'::request_status,
      ${input.callerMaxCreditMicros?.toString() ?? null},
      ${reservationCreditMicros.toString()},
      ${reservationCreditMicros.toString()},
      0,
      ${PRICING_VERSION},
      ${input.idempotencyKey},
      ${idempotencyRequestHash},
      ${input.webhookUrl},
      ${transaction.json(input.metadata as postgres.JSONValue)}
    `;
    const returnedFields = transaction`
      id,
      query,
      effort,
      resolved_effort,
      max_resolved_effort,
      platforms,
      status,
      effective_cap_microcredits::text,
      reserved_microcredits::text,
      spent_microcredits::text,
      error_code,
      error_message,
      null::jsonb as response_json,
      idempotency_request_hash
    `;
    const rows = input.idempotencyKey
      ? await transaction<ContextRequestSelectRow[]>`
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
            idempotency_key,
            idempotency_request_hash,
            webhook_url,
            metadata
          )
          values (${values})
          on conflict (workspace_id, idempotency_key)
          where idempotency_key is not null
          do nothing
          returning ${returnedFields}
        `
      : await transaction<ContextRequestSelectRow[]>`
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
            idempotency_key,
            idempotency_request_hash,
            webhook_url,
            metadata
          )
          values (${values})
          returning ${returnedFields}
        `;

    return rows[0] ? mapRequestRow(rows[0]) : null;
  }
}
