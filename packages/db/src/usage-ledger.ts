import type postgres from "postgres";
import type { LedgerEventType } from "@supacontext/core";
import type { CreditBalanceRow, UsageLedgerRow } from "./types.js";

export type InsertUsageLedgerInput = {
  workspaceId: string;
  eventType: LedgerEventType;
  credits: number;
  contextRequestId?: string;
  idempotencyKey?: string;
  metadata?: postgres.JSONValue;
};

export async function getCreditBalance(
  sql: postgres.Sql,
  workspaceId: string,
): Promise<CreditBalanceRow | null> {
  const rows = await sql<CreditBalanceRow[]>`
    select workspace_id, balance, updated_at
    from credit_balances
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function insertUsageLedgerEntry(
  sql: postgres.Sql,
  input: InsertUsageLedgerInput,
): Promise<UsageLedgerRow> {
  const rows = await sql<UsageLedgerRow[]>`
    insert into usage_ledger (
      workspace_id,
      event_type,
      credits,
      context_request_id,
      idempotency_key,
      metadata
    )
    values (
      ${input.workspaceId},
      ${input.eventType},
      ${input.credits},
      ${input.contextRequestId ?? null},
      ${input.idempotencyKey ?? null},
      ${sql.json(input.metadata ?? {})}
    )
    returning id, workspace_id, event_type, credits, context_request_id, idempotency_key, created_at
  `;

  const row = rows[0];

  if (!row) {
    throw new Error("Failed to insert usage ledger entry.");
  }

  return row;
}
