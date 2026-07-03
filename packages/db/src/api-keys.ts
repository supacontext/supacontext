import type postgres from "postgres";
import type { ApiKeyRow } from "./types.js";

export async function findActiveApiKeyByHash(
  sql: postgres.Sql,
  keyHash: string,
): Promise<ApiKeyRow | null> {
  const rows = await sql<ApiKeyRow[]>`
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
    where key_hash = ${keyHash}
      and revoked_at is null
    limit 1
  `;

  return rows[0] ?? null;
}

export async function markApiKeyUsed(sql: postgres.Sql, apiKeyId: string): Promise<void> {
  await sql`
    update api_keys
    set last_used_at = now()
    where id = ${apiKeyId}
      and revoked_at is null
  `;
}
