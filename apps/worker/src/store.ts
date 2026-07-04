import type {
  ContextDepth,
  Platform,
  PlatformMode,
  ProviderName,
  RequestStatus,
} from "@supacontext/core";
import type { DatabaseClient } from "@supacontext/db";
import type { ProviderCallLogInput } from "@supacontext/providers";
import type postgres from "postgres";
import type { PublicContextResult } from "./public-result.js";

export type WorkerContextRequest = {
  id: string;
  workspaceId: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  platformMode: PlatformMode;
  status: RequestStatus;
  spentCredits: number;
  webhookUrl: string | null;
};

export type WorkerClaimResult = {
  request: WorkerContextRequest | null;
  claimed: boolean;
};

type ContextRequestRow = {
  id: string;
  workspace_id: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  platform_mode: PlatformMode;
  status: RequestStatus;
  spent_credits: number;
  webhook_url: string | null;
};

export interface WorkerStore {
  findRequest(requestId: string): Promise<WorkerContextRequest | null>;
  claimRequest(requestId: string): Promise<WorkerClaimResult>;
  completeRequest(
    requestId: string,
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

export class PostgresWorkerStore implements WorkerStore {
  constructor(private readonly sql: DatabaseClient) {}

  async findRequest(requestId: string): Promise<WorkerContextRequest | null> {
    const rows = await this.sql<ContextRequestRow[]>`
      select
        id,
        workspace_id,
        query,
        depth,
        platforms,
        platform_mode,
        status,
        spent_credits,
        webhook_url
      from context_requests
      where id = ${requestId}
      limit 1
    `;

    return rows[0] ? mapRequest(rows[0]) : null;
  }

  async claimRequest(requestId: string): Promise<WorkerClaimResult> {
    const rows = await this.sql<ContextRequestRow[]>`
      update context_requests
      set
        status = 'running',
        started_at = coalesce(started_at, now())
      where id = ${requestId}
        and status = 'queued'
      returning
        id,
        workspace_id,
        query,
        depth,
        platforms,
        platform_mode,
        status,
        spent_credits,
        webhook_url
    `;

    if (rows[0]) {
      return {
        request: mapRequest(rows[0]),
        claimed: true,
      };
    }

    return {
      request: await this.findRequest(requestId),
      claimed: false,
    };
  }

  async completeRequest(
    requestId: string,
    result: PublicContextResult,
  ): Promise<WorkerContextRequest | null> {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<ContextRequestRow[]>`
        with saved_result as (
          insert into context_results (
            context_request_id,
            response_json,
            citation_count
          )
          values (
            ${requestId},
            ${transaction.json(result as postgres.JSONValue)},
            ${result.sources.length}
          )
          on conflict (context_request_id) do update
          set
            response_json = excluded.response_json,
            citation_count = excluded.citation_count
        )
        update context_requests
        set
          status = 'completed',
          completed_at = now(),
          error_code = null,
          error_message = null
        where id = ${requestId}
        returning
          id,
          workspace_id,
          query,
          depth,
          platforms,
          platform_mode,
          status,
          spent_credits,
          webhook_url
      `;

      return rows[0] ? mapRequest(rows[0]) : null;
    });
  }

  async failRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<WorkerContextRequest | null> {
    const rows = await this.sql<ContextRequestRow[]>`
      update context_requests
      set
        status = 'failed',
        error_code = ${errorCode},
        error_message = ${errorMessage},
        completed_at = now()
      where id = ${requestId}
        and status <> 'completed'
      returning
        id,
        workspace_id,
        query,
        depth,
        platforms,
        platform_mode,
        status,
        spent_credits,
        webhook_url
    `;

    return rows[0] ? mapRequest(rows[0]) : this.findRequest(requestId);
  }

  async saveProviderCallLog(input: ProviderCallLogInput): Promise<void> {
    await this.sql`
      insert into provider_call_logs (
        context_request_id,
        provider,
        platform,
        status_code,
        duration_ms,
        cost_cents,
        input_tokens,
        output_tokens,
        error_code,
        error_message
      )
      values (
        ${input.contextRequestId},
        ${input.provider as ProviderName},
        ${input.platform},
        ${input.statusCode},
        ${input.durationMs},
        ${input.costCents ?? null},
        ${input.inputTokens ?? null},
        ${input.outputTokens ?? null},
        ${input.errorCode ?? null},
        ${input.errorMessage ?? null}
      )
    `;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

function mapRequest(row: ContextRequestRow): WorkerContextRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    query: row.query,
    depth: row.depth,
    platforms: row.platforms,
    platformMode: row.platform_mode,
    status: row.status,
    spentCredits: row.spent_credits,
    webhookUrl: row.webhook_url,
  };
}
