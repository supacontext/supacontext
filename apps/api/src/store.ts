import { createHash, randomBytes } from "node:crypto";
import {
  CONTEXT_DEPTHS,
  type ContextDepth,
  type Platform,
  type PlatformMode,
  type PlanSlug,
} from "@supacontext/core";
import {
  findActiveApiKeyByHash,
  markApiKeyUsed,
  type ApiKeyRow,
  type DatabaseClient,
} from "@supacontext/db";
import { authorizeUsage } from "@supacontext/usage";
import type postgres from "postgres";
import { ApiError } from "./errors.js";
import type { StoredContextRequest, StoredContextResultPayload } from "./public-response.js";

type ContextRequestSelectRow = {
  id: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  status: StoredContextRequest["status"];
  spent_credits: number;
  error_code: string | null;
  error_message: string | null;
  response_json: unknown | null;
  idempotency_request_hash?: string | null;
};

export type ContextRequestIdempotencyShape = {
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  platformMode: PlatformMode;
  async: boolean;
  webhookUrl: string | null;
  metadata: Record<string, unknown>;
};

export type FailContextRequestOptions = {
  refundCredits?: boolean;
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
  countActiveJobs(workspaceId: string, depth?: ContextDepth): Promise<number>;
  acceptContextRequest(input: AcceptContextRequestInput): Promise<AcceptContextRequestResult>;
  markRequestRunning(requestId: string): Promise<StoredContextRequest>;
  completeContextRequest(
    requestId: string,
    result: StoredContextResultPayload,
  ): Promise<StoredContextRequest>;
  attachQstashMessageId(requestId: string, messageId: string): Promise<void>;
  failContextRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
    options?: FailContextRequestOptions,
  ): Promise<void>;
  close(): Promise<void>;
}

function createContextRequestId(): string {
  return `ctx_${randomBytes(16).toString("base64url")}`;
}

function stableStringify(value: unknown): string {
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
        depth: input.depth,
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

function mapResultPayload(value: unknown): StoredContextResultPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as StoredContextResultPayload;
}

function mapRequestRow(row: ContextRequestSelectRow): StoredContextRequest {
  return {
    id: row.id,
    query: row.query,
    depth: row.depth,
    platforms: row.platforms,
    status: row.status,
    spent_credits: row.spent_credits,
    error_code: row.error_code,
    error_message: row.error_message,
    result: mapResultPayload(row.response_json),
  };
}

function mapUsageDenial(reason: Exclude<ReturnType<typeof authorizeUsage>, { allowed: true }>["reason"]): ApiError {
  if (reason === "monthly_limit") {
    return new ApiError(
      402,
      "insufficient_credits",
      "API key monthly credit limit would be exceeded.",
      { reason: "monthly_limit" },
    );
  }

  if (reason === "credits") {
    return new ApiError(402, "insufficient_credits", "Insufficient account credits.");
  }

  return new ApiError(403, "forbidden_depth", "Requested depth is not allowed for this API key or plan.");
}

function assertPlanSlug(value: string): PlanSlug {
  if (value === "trial" || value === "starter" || value === "builder" || value === "pro" || value === "scale") {
    return value;
  }

  return "trial";
}

function assertDepth(value: ContextDepth): ContextDepth {
  if (CONTEXT_DEPTHS.includes(value)) {
    return value;
  }

  return "standard";
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

  async countActiveJobs(workspaceId: string, depth?: ContextDepth): Promise<number> {
    const depthFilter = depth
      ? this.sql`and depth = ${depth}`
      : this.sql``;
    const rows = await this.sql<Array<{ count: number }>>`
      select count(*)::int as count
      from context_requests
      where workspace_id = ${workspaceId}
        and status in ('queued', 'running')
        ${depthFilter}
    `;

    return rows[0]?.count ?? 0;
  }

  async acceptContextRequest(input: AcceptContextRequestInput): Promise<AcceptContextRequestResult> {
    return this.sql.begin(async (transaction) => {
      const idempotencyRequestHash = createContextRequestIdempotencyHash(input);

      if (input.idempotencyKey) {
        const existing = await this.findByIdempotencyKeyInTransaction(
          transaction,
          input.apiKey.workspace_id,
          input.idempotencyKey,
          idempotencyRequestHash,
        );

        if (existing) {
          return {
            request: existing,
            created: false,
          };
        }
      }

      const apiKey = await this.getApiKeyForUpdate(transaction, input.apiKey.id);
      const balance = await this.getBalanceForUpdate(transaction, input.apiKey.workspace_id);
      const authorization = authorizeUsage({
        plan: input.plan,
        depth: input.depth,
        balance,
        apiKeyMaxDepth: assertDepth(apiKey.max_depth),
        monthlyCreditLimit: apiKey.monthly_credit_limit,
        monthToDateCredits: apiKey.month_to_date_credits,
      });

      if (!authorization.allowed) {
        throw mapUsageDenial(authorization.reason);
      }

      const request = await this.insertContextRequest(transaction, input, authorization.requiredCredits);

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

        return {
          request: existing,
          created: false,
        };
      }

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
          ${input.apiKey.workspace_id},
          'debit'::ledger_event_type,
          ${authorization.requiredCredits * -1},
          ${request.id},
          ${`request:${request.id}`},
          ${transaction.json({
            api_key_id: input.apiKey.id,
            depth: input.depth,
          })}
        )
      `;

      await transaction`
        update api_keys
        set month_to_date_credits = month_to_date_credits + ${authorization.requiredCredits}
        where id = ${input.apiKey.id}
      `;

      return {
        request,
        created: true,
      };
    });
  }

  async markRequestRunning(requestId: string): Promise<StoredContextRequest> {
    const rows = await this.sql<ContextRequestSelectRow[]>`
      update context_requests
      set
        status = 'running',
        started_at = coalesce(started_at, now())
      where id = ${requestId}
      returning
        id,
        query,
        depth,
        platforms,
        status,
        spent_credits,
        error_code,
        error_message,
        null::jsonb as response_json
    `;

    const row = rows[0];

    if (!row) {
      throw new ApiError(404, "job_not_found", "Context request not found.");
    }

    return mapRequestRow(row);
  }

  async completeContextRequest(
    requestId: string,
    result: StoredContextResultPayload,
  ): Promise<StoredContextRequest> {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<ContextRequestSelectRow[]>`
        with target_request as (
          select id
          from context_requests
          where id = ${requestId}
        ),
        saved_result as (
          insert into context_results (
            context_request_id,
            response_json,
            citation_count
          )
          select
            target_request.id,
            ${transaction.json(result as postgres.JSONValue)},
            ${result.sources.length}
          from target_request
          on conflict (context_request_id) do update
          set
            response_json = excluded.response_json,
            citation_count = excluded.citation_count
          returning response_json
        )
        update context_requests
        set
          status = 'completed',
          completed_at = now()
        from saved_result
        where context_requests.id = ${requestId}
        returning
          context_requests.id,
          context_requests.query,
          context_requests.depth,
          context_requests.platforms,
          context_requests.status,
          context_requests.spent_credits,
          context_requests.error_code,
          context_requests.error_message,
          saved_result.response_json
      `;

      const row = rows[0];

      if (!row) {
        throw new ApiError(404, "job_not_found", "Context request not found.");
      }

      return mapRequestRow(row);
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
    options: FailContextRequestOptions = {},
  ): Promise<void> {
    await this.sql.begin(async (transaction) => {
      const rows = await transaction<
        Array<{
          workspace_id: string;
          api_key_id: string | null;
          spent_credits: number;
        }>
      >`
        select workspace_id, api_key_id, spent_credits
        from context_requests
        where id = ${requestId}
        for update
      `;
      const request = rows[0];

      if (!request) {
        return;
      }

      await transaction`
        update context_requests
        set
          status = 'failed',
          spent_credits = ${options.refundCredits ? 0 : request.spent_credits},
          error_code = ${errorCode},
          error_message = ${errorMessage},
          completed_at = now()
        where id = ${requestId}
      `;

      if (!options.refundCredits || request.spent_credits <= 0) {
        return;
      }

      const refundRows = await transaction<Array<{ id: string }>>`
        insert into usage_ledger (
          workspace_id,
          event_type,
          credits,
          context_request_id,
          idempotency_key,
          metadata
        )
        values (
          ${request.workspace_id},
          'refund'::ledger_event_type,
          ${request.spent_credits},
          ${requestId},
          ${`refund:${requestId}`},
          ${transaction.json({ reason: errorCode })}
        )
        on conflict (workspace_id, idempotency_key)
        where idempotency_key is not null
        do nothing
        returning id
      `;

      if (refundRows[0] && request.api_key_id) {
        await transaction`
          update api_keys
          set month_to_date_credits = greatest(0, month_to_date_credits - ${request.spent_credits})
          where id = ${request.api_key_id}
        `;
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
        context_requests.depth,
        context_requests.platforms,
        context_requests.status,
        context_requests.spent_credits,
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
    const rows = await transaction<ApiKeyRow[]>`
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
      where id = ${apiKeyId}
        and revoked_at is null
      for update
    `;

    const row = rows[0];

    if (!row) {
      throw new ApiError(401, "unauthorized", "Invalid API key.");
    }

    return row;
  }

  private async getBalanceForUpdate(
    transaction: postgres.TransactionSql,
    workspaceId: string,
  ): Promise<number> {
    const rows = await transaction<Array<{ balance: number }>>`
      select balance
      from credit_balances
      where workspace_id = ${workspaceId}
      for update
    `;

    return rows[0]?.balance ?? 0;
  }

  private async insertContextRequest(
    transaction: postgres.TransactionSql,
    input: AcceptContextRequestInput,
    credits: number,
  ): Promise<StoredContextRequest | null> {
    const requestId = createContextRequestId();
    const rowFields = transaction`
      id,
      query,
      depth,
      platforms,
      status,
      spent_credits,
      error_code,
      error_message,
      null::jsonb as response_json,
      ${input.idempotencyKey ? createContextRequestIdempotencyHash(input) : null} as idempotency_request_hash
    `;

    const values = transaction`
      ${requestId},
      ${input.apiKey.workspace_id},
      ${input.apiKey.id},
      ${input.query},
      ${input.depth}::context_depth,
      ${input.platforms}::platform[],
      ${input.platformMode},
      'queued'::request_status,
      ${credits},
      ${credits},
      ${input.idempotencyKey},
      ${input.idempotencyKey ? createContextRequestIdempotencyHash(input) : null},
      ${input.webhookUrl},
      ${transaction.json(input.metadata as postgres.JSONValue)}
    `;

    const rows = input.idempotencyKey
      ? await transaction<ContextRequestSelectRow[]>`
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
            idempotency_key,
            idempotency_request_hash,
            webhook_url,
            metadata
          )
          values (${values})
          on conflict (workspace_id, idempotency_key)
          where idempotency_key is not null
          do nothing
          returning ${rowFields}
        `
      : await transaction<ContextRequestSelectRow[]>`
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
            idempotency_key,
            idempotency_request_hash,
            webhook_url,
            metadata
          )
          values (${values})
          returning ${rowFields}
        `;

    const row = rows[0];

    return row ? mapRequestRow(row) : null;
  }
}
