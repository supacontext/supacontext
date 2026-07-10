import type postgres from "postgres";
import type { ApiKeyRow } from "./types.js";

export async function findActiveApiKeyByHash(
  sql: postgres.Sql,
  keyHash: string,
): Promise<ApiKeyRow | null> {
  const rows = await sql<
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
    where key_hash = ${keyHash}
      and revoked_at is null
    limit 1
  `;

  const row = rows[0];

  return row
    ? {
        ...row,
        monthly_credit_limit_microcredits:
          row.monthly_credit_limit_microcredits === null
            ? null
            : BigInt(row.monthly_credit_limit_microcredits),
        month_to_date_microcredits: BigInt(row.month_to_date_microcredits),
      }
    : null;
}

export async function markApiKeyUsed(sql: postgres.Sql, apiKeyId: string): Promise<void> {
  await sql`
    update api_keys
    set last_used_at = now()
    where id = ${apiKeyId}
      and revoked_at is null
  `;
}
