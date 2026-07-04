import type { ContextDepth, Platform, ProviderName } from "@supacontext/core";

export type ProviderCallLogInput = {
  contextRequestId: string;
  provider: ProviderName;
  platform: Platform | null;
  statusCode: number | null;
  durationMs: number;
  costCents?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type ProviderCallLogger = (input: ProviderCallLogInput) => Promise<void> | void;

export type TranscriptSegment = {
  text: string;
  startSeconds: number;
  endSeconds: number | null;
};

export type SourceCandidateMetadata = {
  externalId?: string;
  threadId?: string;
  postId?: string;
  videoId?: string;
  transcriptSegments?: TranscriptSegment[];
};

export type NormalizedSourceCandidate = {
  provider: ProviderName;
  platform: Platform;
  title: string;
  url: string;
  publishedAt: string | null;
  content: string;
  summary: string;
  author?: string;
  metadata?: SourceCandidateMetadata;
};

export type SearchInput = {
  requestId: string;
  query: string;
  limit: number;
};

export type WebSearchInput = SearchInput & {
  platform: "web" | "youtube";
};

export type FetchContentInput = {
  requestId: string;
  candidates: NormalizedSourceCandidate[];
  limit: number;
};

export type RedditThreadFetchInput = {
  requestId: string;
  candidate: NormalizedSourceCandidate;
};

export type XFetchInput = {
  requestId: string;
  candidate: NormalizedSourceCandidate;
};

export type TranscriptFetchInput = {
  requestId: string;
  url: string;
  title?: string;
};

export type RerankChunkInput = {
  id: string;
  text: string;
};

export type RerankInput = {
  requestId: string;
  query: string;
  chunks: RerankChunkInput[];
  topK: number;
};

export type RerankResult = {
  id: string;
  score: number;
};

export type AgentEvidenceInput = {
  sourceId: string;
  platform: Platform;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  startSeconds?: number;
  endSeconds?: number | null;
};

export type DeepSeekReasoningLevel = "low" | "medium" | "high";

export type DeepSeekResearchInput = {
  requestId: string;
  query: string;
  depth: ContextDepth;
  model: string;
  reasoning: DeepSeekReasoningLevel;
  systemPrompt: string;
  userPrompt: string;
  evidence: AgentEvidenceInput[];
};

export type DeepSeekRepairInput = Omit<DeepSeekResearchInput, "userPrompt"> & {
  invalidJson: string;
  validationError: string;
};

export type DeepSeekResult = {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface ExaClient {
  search(input: WebSearchInput): Promise<NormalizedSourceCandidate[]>;
  fetchContent(input: FetchContentInput): Promise<NormalizedSourceCandidate[]>;
}

export interface FetchLayerClient {
  searchReddit(input: SearchInput): Promise<NormalizedSourceCandidate[]>;
  fetchRedditThread(input: RedditThreadFetchInput): Promise<NormalizedSourceCandidate>;
}

export interface XquikClient {
  searchX(input: SearchInput): Promise<NormalizedSourceCandidate[]>;
  fetchXPost(input: XFetchInput): Promise<NormalizedSourceCandidate>;
}

export interface SupadataClient {
  fetchTranscript(input: TranscriptFetchInput): Promise<NormalizedSourceCandidate>;
}

export interface VoyageClient {
  rerank(input: RerankInput): Promise<RerankResult[]>;
}

export interface DeepSeekClient {
  research(input: DeepSeekResearchInput): Promise<DeepSeekResult>;
  repairJson(input: DeepSeekRepairInput): Promise<DeepSeekResult>;
}

export type ProviderClients = {
  exa: ExaClient;
  fetchlayer: FetchLayerClient;
  xquik: XquikClient;
  supadata: SupadataClient;
  voyage: VoyageClient;
  deepseek: DeepSeekClient;
};

export type ProviderClientEnv = {
  nodeEnv: string;
  exaApiKey: string | undefined;
  fetchLayerApiKey: string | undefined;
  xquikApiKey: string | undefined;
  supadataApiKey: string | undefined;
  deepseekApiKey: string | undefined;
  voyageApiKey: string | undefined;
};

export type CreateProviderClientOptions = {
  env?: Partial<ProviderClientEnv>;
  logger?: ProviderCallLogger;
  mode?: "auto" | "mock" | "real";
};

export class NormalizedProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly errorCode: string,
    message: string,
    readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = "NormalizedProviderError";
  }
}

type ProviderCallResult<T> = {
  value: T;
  statusCode: number | null;
  inputTokens?: number;
  outputTokens?: number;
};

type JsonRecord = Record<string, unknown>;

const defaultBaseUrls = {
  exa: "https://api.exa.ai",
  fetchlayer: "https://api.fetchlayer.com/v1",
  xquik: "https://api.xquik.com/v1",
  supadata: "https://api.supadata.ai/v1",
  deepseek: "https://api.deepseek.com",
  voyage: "https://api.voyageai.com/v1",
} as const;

const placeholderKeys = new Set(["", "replace_me", "replace-with-at-least-32-random-characters"]);

function isMissingKey(key: string | undefined): boolean {
  return (
    !key || placeholderKeys.has(key) || key.startsWith("replace_") || key.startsWith("replace-me")
  );
}

function resolveEnv(input: Partial<ProviderClientEnv> | undefined): ProviderClientEnv {
  return {
    nodeEnv: input?.nodeEnv ?? process.env.NODE_ENV ?? "development",
    exaApiKey: input?.exaApiKey ?? process.env.EXA_API_KEY,
    fetchLayerApiKey: input?.fetchLayerApiKey ?? process.env.FETCHLAYER_API_KEY,
    xquikApiKey: input?.xquikApiKey ?? process.env.XQUIK_API_KEY,
    supadataApiKey: input?.supadataApiKey ?? process.env.SUPADATA_API_KEY,
    deepseekApiKey: input?.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY,
    voyageApiKey: input?.voyageApiKey ?? process.env.VOYAGE_API_KEY,
  };
}

function assertRealKey(provider: ProviderName, key: string | undefined): string {
  if (isMissingKey(key)) {
    throw new Error(`${provider.toUpperCase()} API key must be configured for real provider mode.`);
  }

  return key as string;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanProviderText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProviderPublishedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const numericTimestamp = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
  const timestamp =
    numericTimestamp === null
      ? Date.parse(trimmed)
      : numericTimestamp < 1_000_000_000_000
        ? numericTimestamp * 1000
        : numericTimestamp;

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function summarize(value: string): string {
  const cleaned = cleanProviderText(value);

  return cleaned.length > 280 ? `${cleaned.slice(0, 277).trim()}...` : cleaned;
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).at(-1);

    return slug ? slug.replace(/[-_]/g, " ") : parsed.hostname;
  } catch {
    return "Untitled source";
  }
}

function youtubeVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0];
    }

    return parsed.searchParams.get("v") ?? undefined;
  } catch {
    return undefined;
  }
}

function buildCandidate(input: {
  provider: ProviderName;
  platform: Platform;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  content: string | null;
  summary?: string | null;
  author?: string | null;
  metadata?: SourceCandidateMetadata;
}): NormalizedSourceCandidate | null {
  if (!input.url) {
    return null;
  }

  const content = cleanProviderText(input.content ?? input.summary ?? "");
  const title = cleanProviderText(input.title ?? titleFromUrl(input.url));
  const summary = summarize(input.summary ?? content);

  if (!content && !summary) {
    return null;
  }

  return {
    provider: input.provider,
    platform: input.platform,
    title: title || titleFromUrl(input.url),
    url: input.url,
    publishedAt: normalizeProviderPublishedAt(input.publishedAt),
    content: content || summary,
    summary,
    ...(input.author ? { author: input.author } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

abstract class LoggedProvider {
  protected constructor(
    protected readonly provider: ProviderName,
    private readonly logger: ProviderCallLogger | undefined,
  ) {}

  protected async call<T>(
    input: {
      requestId: string;
      platform: Platform | null;
    },
    task: () => Promise<ProviderCallResult<T>>,
  ): Promise<T> {
    const startedAt = Date.now();
    let lastError: NormalizedProviderError | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await task();
        await this.log({
          contextRequestId: input.requestId,
          provider: this.provider,
          platform: input.platform,
          statusCode: result.statusCode,
          durationMs: Date.now() - startedAt,
          ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
          ...(result.outputTokens === undefined ? {} : { outputTokens: result.outputTokens }),
        });

        return result.value;
      } catch (error) {
        const normalized = normalizeProviderError(this.provider, error);
        lastError = normalized;

        if (attempt === 0 && isRetryableProviderError(normalized)) {
          await delay(250);
          continue;
        }

        break;
      }
    }

    const normalized =
      lastError ??
      new NormalizedProviderError(this.provider, "PROVIDER_ERROR", "Provider request failed.");
    await this.log({
      contextRequestId: input.requestId,
      provider: this.provider,
      platform: input.platform,
      statusCode: normalized.statusCode,
      durationMs: Date.now() - startedAt,
      errorCode: normalized.errorCode,
      errorMessage: normalized.message,
    });

    throw normalized;
  }

  private async log(input: ProviderCallLogInput): Promise<void> {
    try {
      await this.logger?.(input);
    } catch {
      // Provider call logging is operational metadata and must not fail customer retrieval.
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProviderError(error: NormalizedProviderError): boolean {
  return error.statusCode === null || error.statusCode === 429 || error.statusCode >= 500;
}

function normalizeProviderError(provider: ProviderName, error: unknown): NormalizedProviderError {
  if (error instanceof NormalizedProviderError) {
    return error;
  }

  if (error instanceof Error) {
    return new NormalizedProviderError(provider, "PROVIDER_ERROR", error.message);
  }

  return new NormalizedProviderError(provider, "PROVIDER_ERROR", "Provider request failed.");
}

function assertOk(provider: ProviderName, response: Response): void {
  if (!response.ok) {
    throw new NormalizedProviderError(
      provider,
      response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_HTTP_ERROR",
      `${provider} request failed with status ${response.status}.`,
      response.status,
    );
  }
}

class HttpExaClient extends LoggedProvider implements ExaClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl = defaultBaseUrls.exa,
  ) {
    super("exa", logger);
  }

  async search(input: WebSearchInput): Promise<NormalizedSourceCandidate[]> {
    const query =
      input.platform === "youtube"
        ? `${input.query} site:youtube.com/watch OR site:youtu.be`
        : input.query;

    return this.call(
      {
        requestId: input.requestId,
        platform: input.platform,
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/search`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify({
            query,
            numResults: input.limit,
            contents: {
              text: true,
              summary: true,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        assertOk("exa", response);

        const data = asRecord(await readJson(response));
        const candidates = asArray(data.results)
          .map((item) => mapExaResult(asRecord(item), input.platform))
          .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));

        return {
          value: candidates,
          statusCode: response.status,
        };
      },
    );
  }

  async fetchContent(input: FetchContentInput): Promise<NormalizedSourceCandidate[]> {
    const targets = input.candidates.slice(0, input.limit);

    if (targets.length === 0) {
      return [];
    }

    return this.call(
      {
        requestId: input.requestId,
        platform: "web",
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/contents`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify({
            urls: targets.map((candidate) => candidate.url),
            text: true,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        assertOk("exa", response);

        const data = asRecord(await readJson(response));
        const fetched = asArray(data.results)
          .map((item) => mapExaResult(asRecord(item), "web"))
          .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));

        return {
          value: fetched.length > 0 ? fetched : targets,
          statusCode: response.status,
        };
      },
    );
  }
}

function mapExaResult(
  item: JsonRecord,
  platform: "web" | "youtube",
): NormalizedSourceCandidate | null {
  const url = stringValue(item.url);
  const publishedAt =
    stringValue(item.publishedDate) ??
    stringValue(item.published_at) ??
    stringValue(item.createdAt);
  const content =
    stringValue(item.text) ??
    stringValue(item.content) ??
    asArray(item.highlights)
      .map((highlight) => stringValue(highlight))
      .filter(Boolean)
      .join("\n");
  const summary = stringValue(item.summary) ?? stringValue(item.snippet);

  const videoId = platform === "youtube" && url ? youtubeVideoId(url) : undefined;

  return buildCandidate({
    provider: "exa",
    platform,
    title: stringValue(item.title),
    url,
    publishedAt,
    content,
    summary,
    metadata: {
      ...(stringValue(item.id) ? { externalId: stringValue(item.id) as string } : {}),
      ...(videoId ? { videoId } : {}),
    },
  });
}

class HttpFetchLayerClient extends LoggedProvider implements FetchLayerClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl = defaultBaseUrls.fetchlayer,
  ) {
    super("fetchlayer", logger);
  }

  async searchReddit(input: SearchInput): Promise<NormalizedSourceCandidate[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "reddit",
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/reddit/search`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            query: input.query,
            limit: input.limit,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        assertOk("fetchlayer", response);

        const data = asRecord(await readJson(response));
        const items = asArray(data.results ?? data.posts ?? data.data);
        const candidates = items
          .map((item) => mapRedditResult(asRecord(item)))
          .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));

        return {
          value: candidates,
          statusCode: response.status,
        };
      },
    );
  }

  async fetchRedditThread(input: RedditThreadFetchInput): Promise<NormalizedSourceCandidate> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "reddit",
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/reddit/thread`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            url: input.candidate.url,
            id: input.candidate.metadata?.threadId,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        assertOk("fetchlayer", response);

        const data = asRecord(await readJson(response));
        const mapped = mapRedditResult(asRecord(data.thread ?? data.post ?? data));

        return {
          value: mapped ?? input.candidate,
          statusCode: response.status,
        };
      },
    );
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
      "x-api-key": this.apiKey,
    };
  }
}

function mapRedditResult(item: JsonRecord): NormalizedSourceCandidate | null {
  const url = stringValue(item.url) ?? stringValue(item.permalink);
  const title = stringValue(item.title) ?? stringValue(item.subreddit);
  const body = [
    stringValue(item.selftext),
    stringValue(item.body),
    stringValue(item.text),
    stringValue(item.top_comments),
    asArray(item.comments)
      .map((comment) => stringValue(asRecord(comment).body))
      .filter(Boolean)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  return buildCandidate({
    provider: "fetchlayer",
    platform: "reddit",
    title,
    url,
    publishedAt:
      stringValue(item.created_utc) ??
      stringValue(item.published_at) ??
      stringValue(item.createdAt),
    content: body,
    summary: stringValue(item.summary) ?? stringValue(item.snippet),
    author: stringValue(item.author),
    metadata: {
      ...(stringValue(item.id) ? { threadId: stringValue(item.id) as string } : {}),
    },
  });
}

class HttpXquikClient extends LoggedProvider implements XquikClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl = defaultBaseUrls.xquik,
  ) {
    super("xquik", logger);
  }

  async searchX(input: SearchInput): Promise<NormalizedSourceCandidate[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "x",
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/x/search`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            query: input.query,
            limit: input.limit,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        assertOk("xquik", response);

        const data = asRecord(await readJson(response));
        const items = asArray(data.results ?? data.posts ?? data.data);
        const candidates = items
          .map((item) => mapXResult(asRecord(item)))
          .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));

        return {
          value: candidates,
          statusCode: response.status,
        };
      },
    );
  }

  async fetchXPost(input: XFetchInput): Promise<NormalizedSourceCandidate> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "x",
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/x/post`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            url: input.candidate.url,
            id: input.candidate.metadata?.postId,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        assertOk("xquik", response);

        const data = asRecord(await readJson(response));
        const mapped = mapXResult(asRecord(data.post ?? data));

        return {
          value: mapped ?? input.candidate,
          statusCode: response.status,
        };
      },
    );
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
      "x-api-key": this.apiKey,
    };
  }
}

function mapXResult(item: JsonRecord): NormalizedSourceCandidate | null {
  const url = stringValue(item.url) ?? stringValue(item.link);
  const text = stringValue(item.text) ?? stringValue(item.full_text) ?? stringValue(item.body);
  const author =
    stringValue(item.author) ??
    stringValue(item.username) ??
    stringValue(asRecord(item.user).username);
  const title = stringValue(item.title) ?? (author ? `Post by ${author}` : "X post");

  return buildCandidate({
    provider: "xquik",
    platform: "x",
    title,
    url,
    publishedAt: stringValue(item.created_at) ?? stringValue(item.published_at),
    content: text,
    summary: stringValue(item.summary),
    author,
    metadata: {
      ...(stringValue(item.id) ? { postId: stringValue(item.id) as string } : {}),
    },
  });
}

class HttpSupadataClient extends LoggedProvider implements SupadataClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl = defaultBaseUrls.supadata,
  ) {
    super("supadata", logger);
  }

  async fetchTranscript(input: TranscriptFetchInput): Promise<NormalizedSourceCandidate> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "youtube",
      },
      async () => {
        const url = `${this.baseUrl}/youtube/transcript?url=${encodeURIComponent(input.url)}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "x-api-key": this.apiKey,
          },
          signal: AbortSignal.timeout(20_000),
        });
        assertOk("supadata", response);

        const data = asRecord(await readJson(response));
        const segments = normalizeTranscriptSegments(data);
        const transcript = segments.map((segment) => segment.text).join("\n");
        const candidate = buildCandidate({
          provider: "supadata",
          platform: "youtube",
          title: stringValue(data.title) ?? input.title ?? "YouTube transcript",
          url: input.url,
          publishedAt: stringValue(data.published_at) ?? stringValue(data.publishedAt),
          content: stringValue(data.transcript) ?? transcript,
          summary: stringValue(data.summary),
          metadata: {
            ...(youtubeVideoId(input.url) ? { videoId: youtubeVideoId(input.url) as string } : {}),
            ...(segments.length > 0 ? { transcriptSegments: segments } : {}),
          },
        });

        if (!candidate) {
          throw new NormalizedProviderError(
            "supadata",
            "TRANSCRIPT_EMPTY",
            "Transcript was empty.",
          );
        }

        return {
          value: candidate,
          statusCode: response.status,
        };
      },
    );
  }
}

function normalizeTranscriptSegments(data: JsonRecord): TranscriptSegment[] {
  const segmentSource = asArray(data.segments ?? data.transcript ?? data.data);

  return segmentSource
    .map((item) => {
      const record = asRecord(item);
      const text = stringValue(record.text ?? record.content);
      const start = numberValue(record.start ?? record.start_seconds ?? record.offset);
      const duration = numberValue(record.duration);
      const end = numberValue(record.end ?? record.end_seconds);

      if (!text || start === null) {
        return null;
      }

      return {
        text: cleanProviderText(text),
        startSeconds: start,
        endSeconds: end ?? (duration === null ? null : start + duration),
      };
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment));
}

class HttpVoyageClient extends LoggedProvider implements VoyageClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl = defaultBaseUrls.voyage,
  ) {
    super("voyage", logger);
  }

  async rerank(input: RerankInput): Promise<RerankResult[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: null,
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/rerank`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "rerank-2.5",
            query: input.query,
            documents: input.chunks.map((chunk) => chunk.text),
            top_k: input.topK,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        assertOk("voyage", response);

        const data = asRecord(await readJson(response));
        const results = asArray(data.data ?? data.results)
          .map((item) => {
            const record = asRecord(item);
            const index = numberValue(record.index);
            const score = numberValue(record.relevance_score ?? record.score);

            if (index === null || score === null) {
              return null;
            }

            const chunk = input.chunks[index];

            return chunk ? { id: chunk.id, score } : null;
          })
          .filter((result): result is RerankResult => Boolean(result));

        return {
          value: results,
          statusCode: response.status,
        };
      },
    );
  }
}

class HttpDeepSeekClient extends LoggedProvider implements DeepSeekClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl = defaultBaseUrls.deepseek,
  ) {
    super("deepseek", logger);
  }

  async research(input: DeepSeekResearchInput): Promise<DeepSeekResult> {
    return this.chat(input, input.userPrompt);
  }

  async repairJson(input: DeepSeekRepairInput): Promise<DeepSeekResult> {
    const repairPrompt = [
      "Repair the following model output into valid JSON matching the requested SupaContext schema.",
      "Return JSON only. Do not add commentary.",
      `Validation error: ${input.validationError}`,
      "Invalid output:",
      input.invalidJson,
    ].join("\n\n");

    return this.chat(input, repairPrompt);
  }

  private async chat(
    input: DeepSeekResearchInput | DeepSeekRepairInput,
    userPrompt: string,
  ): Promise<DeepSeekResult> {
    return this.call(
      {
        requestId: input.requestId,
        platform: null,
      },
      async () => {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            messages: [
              {
                role: "system",
                content: input.systemPrompt,
              },
              {
                role: "user",
                content: userPrompt,
              },
            ],
            response_format: {
              type: "json_object",
            },
            reasoning_effort: input.reasoning,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        assertOk("deepseek", response);

        const data = asRecord(await readJson(response));
        const choice = asRecord(asArray(data.choices)[0]);
        const message = asRecord(choice.message);
        const usage = asRecord(data.usage);
        const content = stringValue(message.content);

        if (!content) {
          throw new NormalizedProviderError(
            "deepseek",
            "EMPTY_MODEL_OUTPUT",
            "DeepSeek returned empty output.",
          );
        }

        return {
          value: {
            content,
            ...(numberValue(usage.prompt_tokens) === null
              ? {}
              : { inputTokens: numberValue(usage.prompt_tokens) as number }),
            ...(numberValue(usage.completion_tokens) === null
              ? {}
              : { outputTokens: numberValue(usage.completion_tokens) as number }),
          },
          statusCode: response.status,
          ...(numberValue(usage.prompt_tokens) === null
            ? {}
            : { inputTokens: numberValue(usage.prompt_tokens) as number }),
          ...(numberValue(usage.completion_tokens) === null
            ? {}
            : { outputTokens: numberValue(usage.completion_tokens) as number }),
        };
      },
    );
  }
}

class MockExaClient extends LoggedProvider implements ExaClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("exa", logger);
  }

  async search(input: WebSearchInput): Promise<NormalizedSourceCandidate[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: input.platform,
      },
      async () => ({
        value: Array.from({ length: input.limit }, (_, index) => {
          const number = index + 1;
          const url =
            input.platform === "youtube"
              ? `https://www.youtube.com/watch?v=mock${number}`
              : `https://example.com/${encodeURIComponent(input.query)}/${number}`;

          return {
            provider: "exa" as const,
            platform: input.platform,
            title: `${input.platform} result ${number} for ${input.query}`,
            url,
            publishedAt: "2026-01-01T00:00:00.000Z",
            content: `${input.query} public context evidence from ${input.platform} result ${number}. It includes cited facts and concise detail for testing.`,
            summary: `${input.query} evidence ${number}`,
            metadata: input.platform === "youtube" ? { videoId: `mock${number}` } : {},
          };
        }),
        statusCode: 200,
      }),
    );
  }

  async fetchContent(input: FetchContentInput): Promise<NormalizedSourceCandidate[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "web",
      },
      async () => ({
        value: input.candidates.slice(0, input.limit).map((candidate) => ({
          ...candidate,
          content: `${candidate.content}\n\nExpanded fetched content for ${candidate.title}.`,
        })),
        statusCode: 200,
      }),
    );
  }
}

class MockFetchLayerClient extends LoggedProvider implements FetchLayerClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("fetchlayer", logger);
  }

  async searchReddit(input: SearchInput): Promise<NormalizedSourceCandidate[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "reddit",
      },
      async () => ({
        value: Array.from({ length: input.limit }, (_, index) => ({
          provider: "fetchlayer" as const,
          platform: "reddit" as const,
          title: `Reddit discussion ${index + 1} for ${input.query}`,
          url: `https://www.reddit.com/r/mock/comments/${index + 1}`,
          publishedAt: "2026-01-02T00:00:00.000Z",
          content: `${input.query} reddit thread summary with community context and cited details.`,
          summary: `${input.query} reddit evidence ${index + 1}`,
          metadata: {
            threadId: `thread_${index + 1}`,
          },
        })),
        statusCode: 200,
      }),
    );
  }

  async fetchRedditThread(input: RedditThreadFetchInput): Promise<NormalizedSourceCandidate> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "reddit",
      },
      async () => ({
        value: {
          ...input.candidate,
          content: `${input.candidate.content}\nTop comments add more evidence about ${input.candidate.title}.`,
        },
        statusCode: 200,
      }),
    );
  }
}

class MockXquikClient extends LoggedProvider implements XquikClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("xquik", logger);
  }

  async searchX(input: SearchInput): Promise<NormalizedSourceCandidate[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "x",
      },
      async () => ({
        value: Array.from({ length: input.limit }, (_, index) => ({
          provider: "xquik" as const,
          platform: "x" as const,
          title: `X post ${index + 1} for ${input.query}`,
          url: `https://x.com/mock/status/${index + 1}`,
          publishedAt: "2026-01-03T00:00:00.000Z",
          content: `${input.query} x post evidence with public commentary and concise signal.`,
          summary: `${input.query} x evidence ${index + 1}`,
          metadata: {
            postId: `post_${index + 1}`,
          },
        })),
        statusCode: 200,
      }),
    );
  }

  async fetchXPost(input: XFetchInput): Promise<NormalizedSourceCandidate> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "x",
      },
      async () => ({
        value: {
          ...input.candidate,
          content: `${input.candidate.content}\nThread context for ${input.candidate.title}.`,
        },
        statusCode: 200,
      }),
    );
  }
}

class MockSupadataClient extends LoggedProvider implements SupadataClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("supadata", logger);
  }

  async fetchTranscript(input: TranscriptFetchInput): Promise<NormalizedSourceCandidate> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "youtube",
      },
      async () => {
        const videoId = youtubeVideoId(input.url);
        const segments = Array.from({ length: 12 }, (_, index) => ({
          text: `${input.title ?? "Video"} transcript segment ${index + 1} about public context and citations.`,
          startSeconds: index * 30,
          endSeconds: index * 30 + 24,
        }));

        return {
          value: {
            provider: "supadata" as const,
            platform: "youtube" as const,
            title: input.title ?? "YouTube transcript",
            url: input.url,
            publishedAt: "2026-01-04T00:00:00.000Z",
            content: segments.map((segment) => segment.text).join("\n"),
            summary: "Mock YouTube transcript evidence.",
            metadata: {
              ...(videoId ? { videoId } : {}),
              transcriptSegments: segments,
            },
          },
          statusCode: 200,
        };
      },
    );
  }
}

class MockVoyageClient extends LoggedProvider implements VoyageClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("voyage", logger);
  }

  async rerank(input: RerankInput): Promise<RerankResult[]> {
    return this.call(
      {
        requestId: input.requestId,
        platform: null,
      },
      async () => ({
        value: input.chunks.slice(0, input.topK).map((chunk, index) => ({
          id: chunk.id,
          score: 1 - index / 100,
        })),
        statusCode: 200,
      }),
    );
  }
}

class MockDeepSeekClient extends LoggedProvider implements DeepSeekClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("deepseek", logger);
  }

  async research(input: DeepSeekResearchInput): Promise<DeepSeekResult> {
    return this.call(
      {
        requestId: input.requestId,
        platform: null,
      },
      async () => ({
        value: {
          content: JSON.stringify({
            answer: `Mock context for ${input.query}.`,
            context_pack: input.evidence.slice(0, 3).map((evidence) => ({
              claim: `Evidence from ${evidence.title} is relevant to ${input.query}.`,
              confidence: "medium",
              supporting_sources: [evidence.sourceId],
            })),
            sources: [],
            gaps: [],
          }),
          inputTokens: input.systemPrompt.length + input.userPrompt.length,
          outputTokens: 200,
        },
        statusCode: 200,
        inputTokens: input.systemPrompt.length + input.userPrompt.length,
        outputTokens: 200,
      }),
    );
  }

  async repairJson(input: DeepSeekRepairInput): Promise<DeepSeekResult> {
    return this.call(
      {
        requestId: input.requestId,
        platform: null,
      },
      async () => ({
        value: {
          content: JSON.stringify({
            answer: `Repaired mock context for ${input.query}.`,
            context_pack: input.evidence.slice(0, 2).map((evidence) => ({
              claim: `Repaired evidence from ${evidence.title}.`,
              confidence: "medium",
              supporting_sources: [evidence.sourceId],
            })),
            sources: [],
            gaps: [],
          }),
          inputTokens: input.invalidJson.length,
          outputTokens: 120,
        },
        statusCode: 200,
        inputTokens: input.invalidJson.length,
        outputTokens: 120,
      }),
    );
  }
}

export function createMockProviderClients(logger?: ProviderCallLogger): ProviderClients {
  return {
    exa: new MockExaClient(logger),
    fetchlayer: new MockFetchLayerClient(logger),
    xquik: new MockXquikClient(logger),
    supadata: new MockSupadataClient(logger),
    voyage: new MockVoyageClient(logger),
    deepseek: new MockDeepSeekClient(logger),
  };
}

export function createProviderClients(options: CreateProviderClientOptions = {}): ProviderClients {
  const env = resolveEnv(options.env);
  const mode = options.mode ?? "auto";
  const hasMissingKey = [
    env.exaApiKey,
    env.fetchLayerApiKey,
    env.xquikApiKey,
    env.supadataApiKey,
    env.deepseekApiKey,
    env.voyageApiKey,
  ].some((key) => isMissingKey(key));

  if (mode === "mock" || (mode === "auto" && env.nodeEnv !== "production" && hasMissingKey)) {
    return createMockProviderClients(options.logger);
  }

  return {
    exa: new HttpExaClient(assertRealKey("exa", env.exaApiKey), options.logger),
    fetchlayer: new HttpFetchLayerClient(
      assertRealKey("fetchlayer", env.fetchLayerApiKey),
      options.logger,
    ),
    xquik: new HttpXquikClient(assertRealKey("xquik", env.xquikApiKey), options.logger),
    supadata: new HttpSupadataClient(assertRealKey("supadata", env.supadataApiKey), options.logger),
    voyage: new HttpVoyageClient(assertRealKey("voyage", env.voyageApiKey), options.logger),
    deepseek: new HttpDeepSeekClient(assertRealKey("deepseek", env.deepseekApiKey), options.logger),
  };
}
