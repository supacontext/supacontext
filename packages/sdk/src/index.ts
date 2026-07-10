export type ContextEffort = "low" | "medium" | "high" | "x_high" | "auto";
export type ResolvedEffort = Exclude<ContextEffort, "auto">;
export type Platform =
  | "web"
  | "reddit"
  | "x"
  | "youtube"
  | "facebook"
  | "news"
  | "forums"
  | "places"
  | "linkedin"
  | "hackernews"
  | "github";
export type RequestStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type SupaContextUsage = {
  credits_charged: number;
  credits_reserved: number;
  effort: ContextEffort;
  resolved_effort?: ResolvedEffort;
  platforms_used: Platform[];
  sources_considered: number;
  sources_used: number;
  cached: boolean;
};

export type SupaContextResponse = {
  id: string;
  query: string;
  effort: ContextEffort;
  resolved_effort?: ResolvedEffort;
  status: RequestStatus;
  answer: string | null;
  context_pack: unknown[];
  sources: unknown[];
  gaps: unknown[];
  usage: SupaContextUsage;
};

export type QueuedContextResponse = {
  id: string;
  status: "queued";
  credits_reserved: number;
};

export type ContextCreateResponse = SupaContextResponse | QueuedContextResponse;

export type ContextCreateInput = {
  query: string;
  effort?: ContextEffort;
  max_credits?: number;
  platforms?: Platform[];
  async?: boolean;
  webhook_url?: string;
  metadata?: Record<string, unknown>;
};

export type SupaContextClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type RequestOptions = {
  idempotencyKey?: string;
};

export type PollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

const defaultBaseUrl = "https://api.supacontext.ai";

export class SupaContextError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SupaContextError";
  }
}

export class SupaContext {
  readonly context = {
    create: (input: ContextCreateInput, options: RequestOptions = {}) =>
      this.post<ContextCreateResponse>("/v1/context", input, options),
    get: (id: string) => this.get<SupaContextResponse>(`/v1/context/${encodeURIComponent(id)}`),
    poll: (id: string, options: PollOptions = {}) => this.pollContext(id, options),
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SupaContextClientOptions) {
    if (!options.apiKey) {
      throw new Error("Supacontext API key is required.");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: "GET",
    });
  }

  private async post<T>(path: string, body: unknown, options: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...init.headers,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const body = data as ErrorBody;
      const code = body.error?.code ?? "internal_error";
      const message =
        body.error?.message ?? `Supacontext request failed with status ${response.status}.`;

      throw new SupaContextError(response.status, code, message, body.error?.details);
    }

    return data as T;
  }

  private async pollContext(id: string, options: PollOptions): Promise<SupaContextResponse> {
    const intervalMs = options.intervalMs ?? 1_000;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const expiresAt = Date.now() + timeoutMs;

    while (Date.now() <= expiresAt) {
      const response = await this.context.get(id);

      if (
        response.status === "completed" ||
        response.status === "failed" ||
        response.status === "cancelled"
      ) {
        return response;
      }

      await delay(intervalMs);
    }

    throw new SupaContextError(408, "timeout", "Timed out waiting for context request.");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSupaContext(options: SupaContextClientOptions): SupaContext {
  return new SupaContext(options);
}
