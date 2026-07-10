import {
  PRICING_VERSION,
  creditMicrocreditsToDisplayNumber,
  type ContextEffort,
  type Platform,
  type PlatformMode,
  type ProviderName,
  type RequestStatus,
  type ResolvedEffort,
} from "@supacontext/core";
import type { DatabaseClient } from "@supacontext/db";
import type { ProviderCallLogInput } from "@supacontext/providers";
import type postgres from "postgres";
import type { PublicContextResult } from "./public-result.js";

export type WorkerContextRequest = {
  id: string;
  workspaceId: string;
  apiKeyId: string | null;
  query: string;
  effort: ContextEffort;
  resolvedEffort: ResolvedEffort | null;
  maxResolvedEffort: ResolvedEffort;
  platforms: Platform[];
  platformMode: PlatformMode;
  status: RequestStatus;
  effectiveCapMicrocredits: bigint;
  committedMicrocredits: bigint;
  claimAttempt: number;
  webhookUrl: string | null;
};

export type WorkerClaimResult = {
  request: WorkerContextRequest | null;
  claimed: boolean;
};

type ContextRequestRow = {
  id: string;
  workspace_id: string;
  api_key_id: string | null;
  query: string;
  effort: ContextEffort;
  resolved_effort: ResolvedEffort | null;
  max_resolved_effort: ResolvedEffort;
  platforms: Platform[];
  platform_mode: PlatformMode;
  status: RequestStatus;
  effective_cap_microcredits: string;
  committed_microcredits: string;
  claim_attempts: number;
  webhook_url: string | null;
};

export type BeginCostEventInput = {
  id: string;
  requestId: string;
  provider: ProviderName;
  platform: Platform | null;
  operation: string;
  reservedMicrocredits: bigint;
  upstreamCostUsdNanos: bigint;
  billableUnits?: bigint;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  model?: string;
};

export type SettleCostEventInput = {
  id: string;
  requestId: string;
  actualMicrocredits: bigint;
  upstreamCostUsdNanos: bigint;
  billableUnits?: bigint;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
};

export interface WorkerStore {
  findRequest(requestId: string): Promise<WorkerContextRequest | null>;
  claimRequest(requestId: string): Promise<WorkerClaimResult>;
  setResolvedEffort(requestId: string, effort: ResolvedEffort): Promise<void>;
  beginCostEvent(input: BeginCostEventInput): Promise<boolean>;
  settleCostEvent(input: SettleCostEventInput): Promise<void>;
  releaseCostEvent(id: string, requestId: string): Promise<void>;
  markCostEventUncertain(id: string, requestId: string): Promise<void>;
  completeRequest(
    requestId: string,
    resolvedEffort: ResolvedEffort,
    result: PublicContextResult,
  ): Promise<WorkerContextRequest | null>;
  failRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<WorkerContextRequest | null>;
  saveProviderCallLog(input: ProviderCallLogInput): Promise<void>;
  close(): Promise<void>;
}

function committedCostSql(transaction: postgres.TransactionSql, requestId: string) {
  return transaction`
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
}

export class PostgresWorkerStore implements WorkerStore {
  constructor(private readonly sql: DatabaseClient) {}

  async findRequest(requestId: string): Promise<WorkerContextRequest | null> {
    const rows = await this.sql<ContextRequestRow[]>`
      select
        context_requests.id,
        context_requests.workspace_id,
        context_requests.api_key_id,
        context_requests.query,
        context_requests.effort,
        context_requests.resolved_effort,
        context_requests.max_resolved_effort,
        context_requests.platforms,
        context_requests.platform_mode,
        context_requests.status,
        context_requests.effective_cap_microcredits::text,
        coalesce(costs.committed_microcredits, '0') as committed_microcredits,
        context_requests.claim_attempts,
        context_requests.webhook_url
      from context_requests
      left join lateral (
        select coalesce(sum(
          case
            when status in ('pending', 'uncertain') then reserved_microcredits
            when status = 'settled' then coalesce(actual_microcredits, reserved_microcredits)
            else 0
          end
        ), 0)::text as committed_microcredits
        from context_cost_events
        where context_request_id = context_requests.id
      ) costs on true
      where context_requests.id = ${requestId}
      limit 1
    `;

    return rows[0] ? mapRequest(rows[0]) : null;
  }

  async claimRequest(requestId: string): Promise<WorkerClaimResult> {
    const rows = await this.sql<ContextRequestRow[]>`
      with claimed as (
        update context_requests
        set
          status = 'running',
          started_at = coalesce(started_at, now()),
          lease_expires_at = now() + interval '5 minutes',
          claim_attempts = claim_attempts + 1
        where id = ${requestId}
          and (
            status = 'queued' or
            (status = 'running' and lease_expires_at < now())
          )
        returning *
      )
      select
        claimed.id,
        claimed.workspace_id,
        claimed.api_key_id,
        claimed.query,
        claimed.effort,
        claimed.resolved_effort,
        claimed.max_resolved_effort,
        claimed.platforms,
        claimed.platform_mode,
        claimed.status,
        claimed.effective_cap_microcredits::text,
        coalesce(costs.committed_microcredits, '0') as committed_microcredits,
        claimed.claim_attempts,
        claimed.webhook_url
      from claimed
      left join lateral (
        select coalesce(sum(
          case
            when status in ('pending', 'uncertain') then reserved_microcredits
            when status = 'settled' then coalesce(actual_microcredits, reserved_microcredits)
            else 0
          end
        ), 0)::text as committed_microcredits
        from context_cost_events
        where context_request_id = claimed.id
      ) costs on true
    `;

    if (rows[0]) {
      return { request: mapRequest(rows[0]), claimed: true };
    }

    return { request: await this.findRequest(requestId), claimed: false };
  }

  async setResolvedEffort(requestId: string, effort: ResolvedEffort): Promise<void> {
    await this.sql`
      update context_requests
      set resolved_effort = ${effort}::context_effort
      where id = ${requestId}
        and status = 'running'
    `;
  }

  async beginCostEvent(input: BeginCostEventInput): Promise<boolean> {
    if (input.reservedMicrocredits <= 0n) {
      throw new Error("Cost-event reservation must be positive.");
    }

    return this.sql.begin(async (transaction) => {
      const requestRows = await transaction<
        Array<{ effective_cap_microcredits: string; status: RequestStatus }>
      >`
        select effective_cap_microcredits::text, status
        from context_requests
        where id = ${input.requestId}
        for update
      `;
      const request = requestRows[0];

      if (!request || request.status !== "running") {
        return false;
      }

      const existing = await transaction<Array<{ id: string }>>`
        select id
        from context_cost_events
        where id = ${input.id}
        limit 1
      `;

      if (existing[0]) {
        return false;
      }

      const committedRows = await transaction<Array<{ committed_microcredits: string }>>`
        ${committedCostSql(transaction, input.requestId)}
      `;
      const committed = BigInt(committedRows[0]?.committed_microcredits ?? "0");
      const cap = BigInt(request.effective_cap_microcredits);

      if (committed + input.reservedMicrocredits > cap) {
        return false;
      }

      await transaction`
        insert into context_cost_events (
          id,
          context_request_id,
          provider,
          platform,
          operation,
          status,
          reserved_microcredits,
          upstream_cost_usd_nanos,
          billable_units,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          model,
          pricing_version
        )
        values (
          ${input.id},
          ${input.requestId},
          ${input.provider}::provider,
          ${input.platform}::platform,
          ${input.operation},
          'pending'::cost_event_status,
          ${input.reservedMicrocredits.toString()},
          ${input.upstreamCostUsdNanos.toString()},
          ${input.billableUnits?.toString() ?? null},
          ${input.inputTokens ?? null},
          ${input.cachedInputTokens ?? null},
          ${input.outputTokens ?? null},
          ${input.model ?? null},
          ${PRICING_VERSION}
        )
      `;

      await this.renewLease(transaction, input.requestId);
      return true;
    });
  }

  async settleCostEvent(input: SettleCostEventInput): Promise<void> {
    await this.sql.begin(async (transaction) => {
      const rows = await transaction<Array<{ reserved_microcredits: string }>>`
        select reserved_microcredits::text
        from context_cost_events
        where id = ${input.id}
          and context_request_id = ${input.requestId}
          and status = 'pending'
        for update
      `;
      const row = rows[0];

      if (!row) {
        return;
      }

      if (
        input.actualMicrocredits < 0n ||
        input.actualMicrocredits > BigInt(row.reserved_microcredits)
      ) {
        throw new Error("Actual provider cost exceeded its preauthorized maximum.");
      }

      await transaction`
        update context_cost_events
        set
          status = 'settled',
          actual_microcredits = ${input.actualMicrocredits.toString()},
          upstream_cost_usd_nanos = ${input.upstreamCostUsdNanos.toString()},
          billable_units = ${input.billableUnits?.toString() ?? null},
          input_tokens = ${input.inputTokens ?? null},
          cached_input_tokens = ${input.cachedInputTokens ?? null},
          output_tokens = ${input.outputTokens ?? null},
          settled_at = now()
        where id = ${input.id}
      `;
      await this.renewLease(transaction, input.requestId);
    });
  }

  async releaseCostEvent(id: string, requestId: string): Promise<void> {
    await this.sql`
      update context_cost_events
      set
        status = 'released',
        actual_microcredits = 0,
        upstream_cost_usd_nanos = 0,
        billable_units = 0,
        settled_at = now()
      where id = ${id}
        and context_request_id = ${requestId}
        and status = 'pending'
    `;
  }

  async markCostEventUncertain(id: string, requestId: string): Promise<void> {
    await this.sql`
      update context_cost_events
      set
        status = 'uncertain',
        actual_microcredits = reserved_microcredits,
        settled_at = now()
      where id = ${id}
        and context_request_id = ${requestId}
        and status = 'pending'
    `;
  }

  async completeRequest(
    requestId: string,
    resolvedEffort: ResolvedEffort,
    result: PublicContextResult,
  ): Promise<WorkerContextRequest | null> {
    await this.sql.begin(async (transaction) => {
      const settled = await this.settleRequest(transaction, requestId);

      if (!settled) {
        return;
      }

      const finalResult: PublicContextResult = {
        ...result,
        usage: {
          ...result.usage,
          credits_charged: creditMicrocreditsToDisplayNumber(settled.actual),
          credits_reserved: 0,
          resolved_effort: resolvedEffort,
        },
      };

      await transaction`
        insert into context_results (
          context_request_id,
          response_json,
          citation_count
        )
        values (
          ${requestId},
          ${transaction.json(finalResult as postgres.JSONValue)},
          ${finalResult.sources.length}
        )
        on conflict (context_request_id) do update
        set
          response_json = excluded.response_json,
          citation_count = excluded.citation_count
      `;

      await transaction`
        update context_requests
        set
          status = 'completed',
          resolved_effort = ${resolvedEffort}::context_effort,
          completed_at = now(),
          settled_at = now(),
          lease_expires_at = null,
          reserved_microcredits = 0,
          spent_microcredits = ${settled.actual.toString()},
          error_code = null,
          error_message = null
        where id = ${requestId}
      `;

      await this.releaseReservation(transaction, settled, "completed");
    });

    return this.findRequest(requestId);
  }

  async failRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<WorkerContextRequest | null> {
    await this.sql.begin(async (transaction) => {
      const settled = await this.settleRequest(transaction, requestId);

      if (!settled) {
        return;
      }

      await transaction`
        update context_requests
        set
          status = 'failed',
          completed_at = now(),
          settled_at = now(),
          lease_expires_at = null,
          reserved_microcredits = 0,
          spent_microcredits = ${settled.actual.toString()},
          error_code = ${errorCode},
          error_message = ${errorMessage}
        where id = ${requestId}
      `;

      await this.releaseReservation(transaction, settled, errorCode);
    });

    return this.findRequest(requestId);
  }

  async saveProviderCallLog(input: ProviderCallLogInput): Promise<void> {
    await this.sql`
      insert into provider_call_logs (
        context_request_id,
        provider,
        platform,
        operation,
        attempt,
        status_code,
        duration_ms,
        billable_units,
        input_tokens,
        cached_input_tokens,
        output_tokens,
        error_code,
        error_message,
        pricing_version
      )
      values (
        ${input.contextRequestId},
        ${input.provider as ProviderName}::provider,
        ${input.platform as Platform | null}::platform,
        ${input.operation},
        1,
        ${input.statusCode},
        ${input.durationMs},
        ${input.billableUnits},
        ${input.inputTokens ?? null},
        ${input.cachedInputTokens ?? null},
        ${input.outputTokens ?? null},
        ${input.errorCode ?? null},
        ${input.errorMessage ?? null},
        ${PRICING_VERSION}
      )
    `;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private async settleRequest(
    transaction: postgres.TransactionSql,
    requestId: string,
  ): Promise<{
    requestId: string;
    workspaceId: string;
    apiKeyId: string | null;
    cap: bigint;
    actual: bigint;
    release: bigint;
  } | null> {
    const requestRows = await transaction<
      Array<{
        workspace_id: string;
        api_key_id: string | null;
        effective_cap_microcredits: string;
        settled_at: Date | null;
      }>
    >`
      select
        workspace_id,
        api_key_id,
        effective_cap_microcredits::text,
        settled_at
      from context_requests
      where id = ${requestId}
      for update
    `;
    const request = requestRows[0];

    if (!request || request.settled_at) {
      return null;
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
      ${committedCostSql(transaction, requestId)}
    `;
    const cap = BigInt(request.effective_cap_microcredits);
    const measured = BigInt(committedRows[0]?.committed_microcredits ?? "0");
    const actual = measured > cap ? cap : measured;

    return {
      requestId,
      workspaceId: request.workspace_id,
      apiKeyId: request.api_key_id,
      cap,
      actual,
      release: cap - actual,
    };
  }

  private async releaseReservation(
    transaction: postgres.TransactionSql,
    settled: {
      requestId: string;
      workspaceId: string;
      apiKeyId: string | null;
      release: bigint;
    },
    reason: string,
  ): Promise<void> {
    if (settled.release <= 0n) {
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
        ${settled.workspaceId},
        'release'::ledger_event_type,
        ${settled.release.toString()},
        ${settled.requestId},
        ${`release:${settled.requestId}`},
        ${transaction.json({ reason, pricing_version: PRICING_VERSION })}
      )
      on conflict (workspace_id, idempotency_key)
      where idempotency_key is not null
      do nothing
      returning id
    `;

    if (releaseRows[0] && settled.apiKeyId) {
      await transaction`
        update api_keys
        set month_to_date_microcredits = greatest(
          0,
          month_to_date_microcredits - ${settled.release.toString()}
        )
        where id = ${settled.apiKeyId}
      `;
    }
  }

  private async renewLease(transaction: postgres.TransactionSql, requestId: string): Promise<void> {
    await transaction`
      update context_requests
      set lease_expires_at = now() + interval '5 minutes'
      where id = ${requestId}
        and status = 'running'
    `;
  }
}

function mapRequest(row: ContextRequestRow): WorkerContextRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    apiKeyId: row.api_key_id,
    query: row.query,
    effort: row.effort,
    resolvedEffort: row.resolved_effort,
    maxResolvedEffort: row.max_resolved_effort,
    platforms: row.platforms,
    platformMode: row.platform_mode,
    status: row.status,
    effectiveCapMicrocredits: BigInt(row.effective_cap_microcredits),
    committedMicrocredits: BigInt(row.committed_microcredits),
    claimAttempt: row.claim_attempts,
    webhookUrl: row.webhook_url,
  };
}
