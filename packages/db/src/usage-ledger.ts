import type postgres from "postgres";
import type { LedgerEventType } from "@supacontext/core";
import type { CreditBalanceRow, UsageLedgerRow } from "./types.js";

export type InsertUsageLedgerInput = {
  workspaceId: string;
  eventType: LedgerEventType;
  creditMicrocredits: bigint;
  contextRequestId?: string;
  idempotencyKey?: string;
  metadata?: postgres.JSONValue;
};

export class DuplicateUsageLedgerEntryError extends Error {
  constructor(
    readonly workspaceId: string,
    readonly idempotencyKey: string,
  ) {
    super("Usage ledger entry already exists for this idempotency key.");
    this.name = "DuplicateUsageLedgerEntryError";
  }
}

export class InsufficientCreditsError extends Error {
  constructor(readonly workspaceId: string) {
    super("Insufficient credits for usage ledger reservation.");
    this.name = "InsufficientCreditsError";
  }
}

type PostgresError = {
  code?: unknown;
  constraint?: unknown;
};

function readPostgresError(error: unknown): PostgresError {
  return typeof error === "object" && error !== null ? (error as PostgresError) : {};
}

function isDuplicateIdempotencyError(error: unknown): boolean {
  const postgresError = readPostgresError(error);

  return (
    postgresError.code === "23505" &&
    postgresError.constraint === "usage_ledger_workspace_idempotency_key_idx"
  );
}

function isInsufficientCreditsError(error: unknown): boolean {
  const postgresError = readPostgresError(error);

  return (
    postgresError.code === "23514" && postgresError.constraint === "credit_balances_balance_check"
  );
}

export async function getCreditBalance(
  sql: postgres.Sql,
  workspaceId: string,
): Promise<CreditBalanceRow | null> {
  const rows = await sql<
    Array<{ workspace_id: string; balance_microcredits: string; updated_at: Date }>
  >`
    select workspace_id, balance_microcredits::text, updated_at
    from credit_balances
    where workspace_id = ${workspaceId}
    limit 1
  `;

  const row = rows[0];

  return row
    ? {
        ...row,
        balance_microcredits: BigInt(row.balance_microcredits),
      }
    : null;
}

export async function insertUsageLedgerEntry(
  sql: postgres.Sql,
  input: InsertUsageLedgerInput,
): Promise<UsageLedgerRow> {
  let rows: Array<Omit<UsageLedgerRow, "credit_microcredits"> & { credit_microcredits: string }>;

  try {
    rows = await sql<
      Array<Omit<UsageLedgerRow, "credit_microcredits"> & { credit_microcredits: string }>
    >`
      insert into usage_ledger (
        workspace_id,
        event_type,
        credit_microcredits,
        context_request_id,
        idempotency_key,
        metadata
      )
      values (
        ${input.workspaceId},
        ${input.eventType},
        ${input.creditMicrocredits.toString()},
        ${input.contextRequestId ?? null},
        ${input.idempotencyKey ?? null},
        ${sql.json(input.metadata ?? {})}
      )
      returning
        id,
        workspace_id,
        event_type,
        credit_microcredits::text,
        context_request_id,
        idempotency_key,
        created_at
    `;
  } catch (error) {
    if (input.idempotencyKey && isDuplicateIdempotencyError(error)) {
      throw new DuplicateUsageLedgerEntryError(input.workspaceId, input.idempotencyKey);
    }

    if (isInsufficientCreditsError(error)) {
      throw new InsufficientCreditsError(input.workspaceId);
    }

    throw error;
  }

  const row = rows[0];

  if (!row) {
    throw new Error("Failed to insert usage ledger entry.");
  }

  return {
    ...row,
    credit_microcredits: BigInt(row.credit_microcredits),
  };
}
