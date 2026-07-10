import { CliError } from "./errors.js";

export type CliDiscovery = {
  api_url: string;
  workos_client_id: string;
  device_authorization_url: string;
  device_token_url: string;
};

export type DeviceAuthorization = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

export type DeviceAuthentication = {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
};

export type DashboardApiKey = {
  id: string;
  name: string;
  prefix: string;
  maxEffort: "low" | "medium" | "high" | "x_high";
  monthlyCreditLimit: number | null;
  monthToDateCredits: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export async function discoverCli(appUrl: string, fetchImpl: typeof fetch): Promise<CliDiscovery> {
  const response = await fetchImpl(`${appUrl.replace(/\/$/, "")}/api/cli/config`);
  const data = await readJson(response);

  if (!response.ok || !isDiscovery(data)) {
    throw responseError(response, data, "Could not load Supacontext CLI configuration.");
  }

  return data;
}

export async function authorizeDevice(
  discovery: CliDiscovery,
  fetchImpl: typeof fetch,
): Promise<DeviceAuthorization> {
  const response = await fetchImpl(discovery.device_authorization_url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: discovery.workos_client_id,
    }),
  });
  const data = await readJson(response);

  if (!response.ok || !isDeviceAuthorization(data)) {
    throw responseError(response, data, "Could not start browser authorization.");
  }

  return data;
}

export async function pollDeviceAuthentication(input: {
  discovery: CliDiscovery;
  authorization: DeviceAuthorization;
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
}): Promise<DeviceAuthentication> {
  let intervalMs = Math.max(input.authorization.interval ?? 5, 1) * 1_000;
  const expiresAt = Date.now() + input.authorization.expires_in * 1_000;

  while (Date.now() < expiresAt) {
    const remainingMs = expiresAt - Date.now();
    const signal = AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs)));
    let response: Response;

    try {
      response = await input.fetch(input.discovery.device_token_url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: input.authorization.device_code,
          client_id: input.discovery.workos_client_id,
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new CliError("AUTHORIZATION_EXPIRED", "Browser authorization expired. Try again.");
      }

      throw error;
    }
    const data = await readJson(response);

    if (response.ok && isDeviceAuthentication(data)) {
      return data;
    }

    const error = getErrorCode(data);

    if (error === "authorization_pending" || error === "slow_down") {
      if (error === "slow_down") {
        intervalMs += 5_000;
      }

      await input.sleep(Math.min(intervalMs, Math.max(expiresAt - Date.now(), 0)));
      continue;
    }

    if (error === "access_denied") {
      throw new CliError("AUTHORIZATION_DENIED", "Browser authorization was denied.");
    }

    if (error === "expired_token") {
      throw new CliError("AUTHORIZATION_EXPIRED", "Browser authorization expired. Try again.");
    }

    throw responseError(response, data, "Browser authorization failed.");
  }

  throw new CliError("AUTHORIZATION_EXPIRED", "Browser authorization expired. Try again.");
}

export async function listApiKeys(
  appUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<DashboardApiKey[]> {
  const response = await fetchImpl(`${appUrl.replace(/\/$/, "")}/api/cli/keys`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await readJson(response);

  if (
    !response.ok ||
    !data ||
    typeof data !== "object" ||
    !("keys" in data) ||
    !Array.isArray(data.keys)
  ) {
    throw responseError(response, data, "Could not list Supacontext API keys.");
  }

  return data.keys as DashboardApiKey[];
}

export async function createApiKey(input: {
  appUrl: string;
  accessToken: string;
  name: string;
  maxEffort: "low" | "medium" | "high" | "x_high";
  monthlyCreditLimit: number | null;
  fetch: typeof fetch;
}): Promise<{ key: DashboardApiKey; rawKey: string }> {
  const response = await input.fetch(`${input.appUrl.replace(/\/$/, "")}/api/cli/keys`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      maxEffort: input.maxEffort,
      monthlyCreditLimit: input.monthlyCreditLimit,
    }),
  });
  const data = await readJson(response);

  if (
    !response.ok ||
    !data ||
    typeof data !== "object" ||
    !("key" in data) ||
    !("rawKey" in data) ||
    typeof data.rawKey !== "string"
  ) {
    throw responseError(response, data, "Could not create a Supacontext API key.");
  }

  return data as { key: DashboardApiKey; rawKey: string };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function getErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const value = data as { error?: unknown };

  if (typeof value.error === "string") {
    return value.error;
  }

  if (value.error && typeof value.error === "object" && "code" in value.error) {
    return typeof value.error.code === "string" ? value.error.code : undefined;
  }

  return undefined;
}

function responseError(response: Response, data: unknown, fallback: string): CliError {
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const nested = body.error && typeof body.error === "object" ? body.error : {};
  const code =
    getErrorCode(data)?.toUpperCase() ??
    (response.status === 401 ? "AUTH_REQUIRED" : "REQUEST_FAILED");
  const message =
    "message" in nested && typeof nested.message === "string"
      ? nested.message
      : typeof body.error_description === "string"
        ? body.error_description
        : fallback;

  return new CliError(code, message);
}

function isDiscovery(value: unknown): value is CliDiscovery {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CliDiscovery>;

  return (
    typeof candidate.api_url === "string" &&
    typeof candidate.workos_client_id === "string" &&
    typeof candidate.device_authorization_url === "string" &&
    typeof candidate.device_token_url === "string"
  );
}

function isDeviceAuthorization(value: unknown): value is DeviceAuthorization {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DeviceAuthorization>;

  return (
    typeof candidate.device_code === "string" &&
    typeof candidate.user_code === "string" &&
    typeof candidate.verification_uri === "string" &&
    typeof candidate.expires_in === "number" &&
    (candidate.verification_uri_complete === undefined ||
      typeof candidate.verification_uri_complete === "string") &&
    (candidate.interval === undefined || typeof candidate.interval === "number")
  );
}

function isDeviceAuthentication(value: unknown): value is DeviceAuthentication {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DeviceAuthentication>;

  return (
    typeof candidate.access_token === "string" &&
    !!candidate.user &&
    typeof candidate.user === "object" &&
    typeof candidate.user.id === "string"
  );
}
