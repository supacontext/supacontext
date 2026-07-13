import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createDatabaseClient, type DatabaseClient } from "@supacontext/db";
import type { WorkspaceContext } from "./dashboard";
import { webEnv } from "./env";

const DEVICE_TTL_SECONDS = 10 * 60;
const CREDENTIAL_TTL_SECONDS = 10 * 60;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const STARTS_PER_MINUTE = 10;
const DECISIONS_PER_MINUTE = 20;
const POLLS_PER_MINUTE = 120;

let database: DatabaseClient | undefined;

type DeviceStatus = "pending" | "approved" | "denied" | "expired" | "consumed";

type DeviceRow = {
  id: string;
  status: DeviceStatus;
  approved_by_profile_id: string | null;
  expires_at: Date;
  poll_interval_seconds: number;
  last_polled_at: Date | null;
};

export class CliAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CliAuthError";
  }
}

export async function createCliDeviceAuthorization(request: Request) {
  const deviceCode = randomBytes(32).toString("base64url");
  const userCode = formatUserCode(randomBytes(8));
  const deviceCodeHash = hashCredential(deviceCode);
  const userCodeHash = hashCredential(normalizeUserCode(userCode));
  const requestIpHash = privateIdentifier("device-ip", requestIp(request));
  const sql = getDatabase();

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as DatabaseClient;

    await enforceRateLimit(tx, "device-start", requestIpHash, STARTS_PER_MINUTE);
    await tx`
      delete from cli_auth_rate_limits
      where window_start < now() - interval '1 hour'
    `;
    await tx`
      delete from cli_device_authorizations
      where created_at < now() - interval '7 days'
    `;
    await tx`
      insert into cli_device_authorizations (
        device_code_hash,
        user_code_hash,
        request_ip_hash,
        expires_at,
        poll_interval_seconds
      )
      values (
        ${deviceCodeHash},
        ${userCodeHash},
        ${requestIpHash},
        now() + (${DEVICE_TTL_SECONDS} * interval '1 second'),
        ${DEFAULT_POLL_INTERVAL_SECONDS}
      )
    `;
  });

  return {
    deviceCode,
    userCode,
    expiresIn: DEVICE_TTL_SECONDS,
    interval: DEFAULT_POLL_INTERVAL_SECONDS,
  };
}

export async function getCliDeviceAuthorization(userCode: string) {
  const normalized = normalizeUserCode(userCode);

  if (!normalized) {
    return null;
  }

  const sql = getDatabase();
  const rows = await sql<DeviceRow[]>`
    update cli_device_authorizations
    set status = 'expired'
    where user_code_hash = ${hashCredential(normalized)}
      and status in ('pending', 'approved')
      and expires_at <= now()
    returning id, status, approved_by_profile_id, expires_at, poll_interval_seconds, last_polled_at
  `;
  const existing =
    rows[0] ??
    (
      await sql<DeviceRow[]>`
        select id, status, approved_by_profile_id, expires_at, poll_interval_seconds, last_polled_at
        from cli_device_authorizations
        where user_code_hash = ${hashCredential(normalized)}
        limit 1
      `
    )[0];

  return existing
    ? {
        code: displayUserCode(normalized),
        status: existing.status,
        expiresAt: existing.expires_at,
      }
    : null;
}

export async function decideCliDeviceAuthorization(input: {
  profileId: string;
  userCode: string;
  decision: "approve" | "deny";
}): Promise<DeviceStatus> {
  const normalized = normalizeUserCode(input.userCode);

  if (!normalized) {
    throw new CliAuthError(404, "NOT_FOUND", "This authorization request was not found.");
  }

  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as DatabaseClient;

    await enforceRateLimit(tx, "device-decision", input.profileId, DECISIONS_PER_MINUTE);
    const rows = await tx<DeviceRow[]>`
      select id, status, approved_by_profile_id, expires_at, poll_interval_seconds, last_polled_at
      from cli_device_authorizations
      where user_code_hash = ${hashCredential(normalized)}
      limit 1
      for update
    `;
    const row = rows[0];

    if (!row) {
      throw new CliAuthError(404, "NOT_FOUND", "This authorization request was not found.");
    }

    if (row.expires_at.getTime() <= Date.now() && ["pending", "approved"].includes(row.status)) {
      await tx`
        update cli_device_authorizations
        set status = 'expired'
        where id = ${row.id}
      `;
      return "expired";
    }

    if (row.status !== "pending") {
      return row.status;
    }

    const status = input.decision === "approve" ? "approved" : "denied";

    await tx`
      update cli_device_authorizations
      set
        status = ${status},
        approved_by_profile_id = ${input.decision === "approve" ? input.profileId : null}
      where id = ${row.id}
        and status = 'pending'
    `;

    return status;
  });
}

export type DeviceRedemption =
  | { status: "pending"; interval: number }
  | { status: "slow_down"; interval: number }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "authorized"; accessToken: string; expiresIn: number };

export async function redeemCliDeviceAuthorization(
  request: Request,
  deviceCode: string,
): Promise<DeviceRedemption> {
  if (!deviceCode || deviceCode.length > 256) {
    return { status: "expired" };
  }

  const credential = `sc_cli_${randomBytes(32).toString("base64url")}`;
  const sql = getDatabase();

  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as DatabaseClient;
    const ipHash = privateIdentifier("device-poll-ip", requestIp(request));

    await enforceRateLimit(tx, "device-poll", ipHash, POLLS_PER_MINUTE);
    const rows = await tx<DeviceRow[]>`
      select id, status, approved_by_profile_id, expires_at, poll_interval_seconds, last_polled_at
      from cli_device_authorizations
      where device_code_hash = ${hashCredential(deviceCode)}
      limit 1
      for update
    `;
    const row = rows[0];

    if (!row) {
      return { status: "expired" };
    }

    if (row.expires_at.getTime() <= Date.now() && ["pending", "approved"].includes(row.status)) {
      await tx`
        update cli_device_authorizations
        set status = 'expired'
        where id = ${row.id}
      `;
      return { status: "expired" };
    }

    if (row.status === "denied") {
      return { status: "denied" };
    }

    if (row.status === "expired") {
      return { status: "expired" };
    }

    if (row.status === "consumed") {
      return { status: "consumed" };
    }

    if (row.status === "pending") {
      const interval = row.poll_interval_seconds;
      const tooSoon =
        row.last_polled_at !== null && Date.now() - row.last_polled_at.getTime() < interval * 1_000;
      const nextInterval = tooSoon ? Math.min(interval + 5, 30) : interval;

      await tx`
        update cli_device_authorizations
        set
          last_polled_at = now(),
          poll_interval_seconds = ${nextInterval}
        where id = ${row.id}
      `;

      return { status: tooSoon ? "slow_down" : "pending", interval: nextInterval };
    }

    if (!row.approved_by_profile_id) {
      return { status: "expired" };
    }

    const redeemed = await tx<Array<{ id: string }>>`
      update cli_device_authorizations
      set
        status = 'consumed',
        credential_hash = ${hashCredential(credential)},
        credential_expires_at = now() + (${CREDENTIAL_TTL_SECONDS} * interval '1 second')
      where id = ${row.id}
        and status = 'approved'
      returning id
    `;

    if (!redeemed[0]) {
      return { status: "consumed" };
    }

    return {
      status: "authorized",
      accessToken: credential,
      expiresIn: CREDENTIAL_TTL_SECONDS,
    };
  });
}

export async function getCliWorkspaceContext(request: Request): Promise<WorkspaceContext | null> {
  const credential = bearerCredential(request);

  if (!credential) {
    return null;
  }

  const rows = await getDatabase()<
    Array<{
      profile_id: string;
      workspace_id: string;
      workos_user_id: string;
      email: string | null;
      display_name: string | null;
    }>
  >`
    with active_credential as (
      update cli_device_authorizations
      set credential_request_count = credential_request_count + 1
      where credential_hash = ${hashCredential(credential)}
        and status = 'consumed'
        and credential_expires_at > now()
        and credential_consumed_at is null
        and credential_request_count < 10
      returning approved_by_profile_id
    )
    select
      profiles.id as profile_id,
      workspaces.id as workspace_id,
      profiles.workos_user_id,
      profiles.email,
      profiles.display_name
    from active_credential
    join profiles on profiles.id = active_credential.approved_by_profile_id
    join workspaces on workspaces.owner_profile_id = profiles.id
    limit 1
  `;
  const row = rows[0];

  return row
    ? {
        profileId: row.profile_id,
        workspaceId: row.workspace_id,
        workosUserId: row.workos_user_id,
        email: row.email,
        displayName: row.display_name,
      }
    : null;
}

export async function revokeCliCredential(request: Request): Promise<boolean> {
  const credential = bearerCredential(request);

  if (!credential) {
    return false;
  }

  const rows = await getDatabase()<Array<{ id: string }>>`
    update cli_device_authorizations
    set credential_consumed_at = now()
    where credential_hash = ${hashCredential(credential)}
      and status = 'consumed'
      and credential_expires_at > now()
      and credential_consumed_at is null
    returning id
  `;

  return rows.length === 1;
}

function getDatabase(): DatabaseClient {
  database ??= createDatabaseClient({
    url: webEnv.DATABASE_URL,
    maxConnections: 3,
  });

  return database;
}

async function enforceRateLimit(
  sql: DatabaseClient,
  scope: string,
  identifier: string,
  limit: number,
) {
  const bucketHash = privateIdentifier(`rate:${scope}`, identifier);
  const rows = await sql<Array<{ request_count: number }>>`
    insert into cli_auth_rate_limits (bucket_hash, window_start, request_count)
    values (${bucketHash}, date_trunc('minute', now()), 1)
    on conflict (bucket_hash, window_start) do update
    set request_count = cli_auth_rate_limits.request_count + 1
    returning request_count
  `;

  if ((rows[0]?.request_count ?? limit + 1) > limit) {
    throw new CliAuthError(429, "RATE_LIMITED", "Too many authorization requests. Try again soon.");
  }
}

function bearerCredential(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i);

  return match?.[1] && match[1].length <= 256 ? match[1] : null;
}

function requestIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown"
  );
}

function hashCredential(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privateIdentifier(scope: string, value: string): string {
  return createHmac("sha256", webEnv.WORKOS_COOKIE_PASSWORD)
    .update(scope)
    .update("\0")
    .update(value)
    .digest("hex");
}

function normalizeUserCode(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");

  return normalized.length === 13 ? normalized : "";
}

function displayUserCode(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
}

function formatUserCode(bytes: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let result = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return displayUserCode(result.slice(0, 13));
}
