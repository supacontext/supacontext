import type { Platform, ProviderName } from "@supacontext/core";

export const REDDIT_OPERATIONS = [
  "search",
  "search-comments",
  "post",
  "community-posts",
  "community-details",
  "user-profile",
  "user-posts",
  "user-comments",
  "search-communities",
  "search-users",
  "comment-permalink",
  "popular",
  "leaderboard",
  "resolve-url-type",
  "explore",
] as const;

export const X_OPERATIONS = [
  "search",
  "tweet-detail",
  "tweet-replies",
  "user-profile-details",
  "about-profile",
  "user-tweets",
  "user-replies",
  "following",
  "followers",
  "verified-followers",
] as const;

export const API_DIRECT_OPERATIONS = [
  "facebook.page",
  "facebook.page_posts",
  "facebook.page_photos",
  "facebook.page_videos",
  "facebook.page_reels",
  "facebook.page_reviews",
  "facebook.group",
  "facebook.group_posts",
  "facebook.group_search",
  "facebook.post_comments",
  "facebook.search_posts",
  "facebook.search_pages",
  "facebook.search_videos",
  "facebook.search_events",
  "facebook.search_locations",
  "youtube.search_videos",
  "youtube.search_channels",
  "youtube.channel",
  "youtube.video",
  "youtube.comments",
  "news.search",
  "forums.search",
  "places.search",
  "places.details",
  "places.reviews",
  "places.photos",
  "linkedin.search_posts",
] as const;

export const HACKER_NEWS_OPERATIONS = [
  "algolia.search",
  "algolia.search_by_date",
  "algolia.item",
  "algolia.user",
  "firebase.item",
  "firebase.user",
  "firebase.top",
  "firebase.new",
  "firebase.best",
  "firebase.ask",
  "firebase.show",
  "firebase.job",
  "firebase.updates",
] as const;

export const GITHUB_OPERATIONS = [
  "search.repositories",
  "search.code",
  "search.issues",
  "search.commits",
  "search.users",
  "search.topics",
  "user",
  "repo.get",
  "repo.readme",
  "repo.contents",
  "repo.tree",
  "repo.languages",
  "repo.topics",
  "repo.commits",
  "repo.releases",
  "repo.contributors",
  "repo.issues",
  "repo.issue_comments",
  "repo.pulls",
  "repo.pull",
  "repo.pull_reviews",
  "repo.pull_review_comments",
] as const;

export const DEEPSEEK_MODELS = {
  flash: "deepseek-v4-flash",
  pro: "deepseek-v4-pro",
} as const;

export const GROQ_ROUTER_MODEL = "qwen/qwen3.6-27b";
export const GITHUB_TOKEN_REQUIREMENT =
  "Use a server-side GitHub token that can read public repositories only; do not grant private repository access.";

export type RedditOperation = (typeof REDDIT_OPERATIONS)[number];
export type XOperation = (typeof X_OPERATIONS)[number];
export type ApiDirectOperation = (typeof API_DIRECT_OPERATIONS)[number];
export type HackerNewsOperation = (typeof HACKER_NEWS_OPERATIONS)[number];
export type GitHubOperation = (typeof GITHUB_OPERATIONS)[number];
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[keyof typeof DEEPSEEK_MODELS];
export type DeepSeekReasoningLevel = "high" | "max";
export type RoutedEffort = "low" | "medium" | "high" | "x_high";

export type ProviderIdentifier = ProviderName;

export type ResearchPlatform = Platform;

export type ProviderCallStatus = "success" | "error";

export type ProviderUsage = {
  provider: ProviderIdentifier;
  operation: string;
  billableUnits: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ProviderResult<T> = {
  data: T;
  usage: ProviderUsage;
};

export type ProviderCallLogInput = {
  contextRequestId: string;
  provider: ProviderIdentifier;
  platform: ResearchPlatform | null;
  operation: string;
  status: ProviderCallStatus;
  statusCode: number | null;
  durationMs: number;
  billableUnits: number;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
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
  attributes?: Record<string, string | number | boolean | null>;
};

export type NormalizedSourceCandidate = {
  provider: ProviderIdentifier;
  platform: ResearchPlatform;
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
  platform: "web";
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
  lang?: string;
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

export type RerankData = {
  results: RerankResult[];
  totalTokens: number | null;
};

export type AgentEvidenceInput = {
  sourceId: string;
  platform: ResearchPlatform;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  startSeconds?: number;
  endSeconds?: number | null;
};

export type DeepSeekResearchInput = {
  requestId: string;
  query: string;
  model: DeepSeekModel;
  reasoning: DeepSeekReasoningLevel;
  systemPrompt: string;
  userPrompt: string;
  evidence: AgentEvidenceInput[];
  maxTokens: number;
};

export type DeepSeekRepairInput = Omit<DeepSeekResearchInput, "userPrompt"> & {
  invalidJson: string;
  validationError: string;
};

export type DeepSeekResult = {
  content: string;
};

export type EffortRouterInput = {
  requestId: string;
  query: string;
  maxTokens: number;
  systemPrompt?: string;
};

export type EffortRouterResult = {
  effort: RoutedEffort;
};

export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;
export type ProviderParams = Record<string, QueryValue>;

export type FetchLayerExecuteInput =
  | {
      requestId: string;
      platform: "reddit";
      operation: RedditOperation;
      params?: ProviderParams;
    }
  | {
      requestId: string;
      platform: "x";
      operation: XOperation;
      params?: ProviderParams;
    };

export type ApiDirectExecuteInput = {
  requestId: string;
  operation: ApiDirectOperation;
  params?: ProviderParams;
};

export type HackerNewsExecuteInput = {
  requestId: string;
  operation: HackerNewsOperation;
  params?: ProviderParams;
};

export type GitHubExecuteInput = {
  requestId: string;
  operation: GitHubOperation;
  params?: ProviderParams;
};

export interface ExaClient {
  search(input: WebSearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
  fetchContent(input: FetchContentInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
}

export interface FetchLayerClient {
  execute(input: FetchLayerExecuteInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
  searchReddit(input: SearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
  fetchRedditThread(
    input: RedditThreadFetchInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate>>;
  searchX(input: SearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
  fetchXPost(input: XFetchInput): Promise<ProviderResult<NormalizedSourceCandidate>>;
}

export interface ApiDirectClient {
  execute(input: ApiDirectExecuteInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
}

export interface SupadataClient {
  fetchTranscript(input: TranscriptFetchInput): Promise<ProviderResult<NormalizedSourceCandidate>>;
}

export interface HackerNewsClient {
  execute(input: HackerNewsExecuteInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
}

export interface GitHubClient {
  execute(input: GitHubExecuteInput): Promise<ProviderResult<NormalizedSourceCandidate[]>>;
}

export interface VoyageClient {
  rerank(input: RerankInput): Promise<ProviderResult<RerankData>>;
}

export interface DeepSeekClient {
  research(input: DeepSeekResearchInput): Promise<ProviderResult<DeepSeekResult>>;
  repairJson(input: DeepSeekRepairInput): Promise<ProviderResult<DeepSeekResult>>;
  routeEffort(input: EffortRouterInput): Promise<ProviderResult<EffortRouterResult>>;
}

export interface GroqClient {
  routeEffort(input: EffortRouterInput): Promise<ProviderResult<EffortRouterResult>>;
}

export type ProviderClients = {
  exa: ExaClient;
  fetchlayer: FetchLayerClient;
  apiDirect: ApiDirectClient;
  supadata: SupadataClient;
  hackerNews: HackerNewsClient;
  github: GitHubClient;
  voyage: VoyageClient;
  deepseek: DeepSeekClient;
  groq: GroqClient;
};

export type ProviderClientEnv = {
  nodeEnv: string;
  exaApiKey: string | undefined;
  fetchLayerApiKey: string | undefined;
  apiDirectApiKey: string | undefined;
  supadataApiKey: string | undefined;
  githubPat: string | undefined;
  deepseekApiKey: string | undefined;
  groqApiKey: string | undefined;
  voyageApiKey: string | undefined;
  fetchLayerBaseUrl: string | undefined;
};

export type ProviderBaseUrls = {
  exa?: string;
  fetchlayer?: string;
  apiDirect?: string;
  supadata?: string;
  hackerNewsAlgolia?: string;
  hackerNewsFirebase?: string;
  github?: string;
  voyage?: string;
  deepseek?: string;
  groq?: string;
};

export type CreateProviderClientOptions = {
  env?: Partial<ProviderClientEnv>;
  baseUrls?: ProviderBaseUrls;
  logger?: ProviderCallLogger;
  mode?: "auto" | "mock" | "real";
};

type JsonRecord = Record<string, unknown>;

type RawCallResult<T> = {
  data: T;
  statusCode: number | null;
  billableUnits: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

const defaultBaseUrls = {
  exa: "https://api.exa.ai",
  fetchlayer: "https://fetchlayer.dev/api",
  apiDirect: "https://apidirect.io",
  supadata: "https://api.supadata.ai/v1",
  hackerNewsAlgolia: "https://hn.algolia.com/api/v1",
  hackerNewsFirebase: "https://hacker-news.firebaseio.com/v0",
  github: "https://api.github.com",
  voyage: "https://api.voyageai.com/v1",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
} as const;

const placeholderKeys = new Set(["", "replace_me", "replace-with-at-least-32-random-characters"]);

export class NormalizedProviderError extends Error {
  constructor(
    readonly provider: ProviderIdentifier,
    readonly errorCode: string,
    message: string,
    readonly statusCode: number | null = null,
    readonly billableUnits = 0,
    readonly inputTokens?: number,
    readonly outputTokens?: number,
    readonly totalTokens?: number,
    readonly cachedInputTokens?: number,
  ) {
    super(message);
    this.name = "NormalizedProviderError";
  }
}

function isMissingKey(key: string | undefined): boolean {
  const normalized = key?.trim().toLowerCase();
  return (
    !normalized ||
    placeholderKeys.has(normalized) ||
    normalized.startsWith("replace_") ||
    normalized.startsWith("replace-me")
  );
}

function resolveEnv(input: Partial<ProviderClientEnv> | undefined): ProviderClientEnv {
  return {
    nodeEnv: input?.nodeEnv ?? process.env.NODE_ENV ?? "development",
    exaApiKey: input?.exaApiKey ?? process.env.EXA_API_KEY,
    fetchLayerApiKey: input?.fetchLayerApiKey ?? process.env.FETCHLAYER_API_KEY,
    apiDirectApiKey: input?.apiDirectApiKey ?? process.env.API_DIRECT_API_KEY,
    supadataApiKey: input?.supadataApiKey ?? process.env.SUPADATA_API_KEY,
    githubPat: input?.githubPat ?? process.env.GITHUB_TOKEN,
    deepseekApiKey: input?.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY,
    groqApiKey: input?.groqApiKey ?? process.env.GROQ_API_KEY,
    voyageApiKey: input?.voyageApiKey ?? process.env.VOYAGE_API_KEY,
    fetchLayerBaseUrl: input?.fetchLayerBaseUrl ?? process.env.FETCHLAYER_BASE_URL,
  };
}

function assertRealKey(provider: ProviderIdentifier, key: string | undefined): string {
  if (isMissingKey(key)) {
    throw new Error(provider.toUpperCase() + " API key must be configured for real provider mode.");
  }

  return (key as string).trim();
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
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

function identifierValue(value: unknown): string | null {
  return stringValue(value) ?? (numberValue(value) === null ? null : String(numberValue(value)));
}

function scalarValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  return numberValue(value);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  const codePoint = (value: string, radix: number): string => {
    const parsed = Number.parseInt(value, radix);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
      ? String.fromCodePoint(parsed)
      : "\ufffd";
  };

  return value
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_match, code: string) => codePoint(code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => codePoint(code, 16));
}

export function cleanProviderText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
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

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function summarize(value: string): string {
  const cleaned = cleanProviderText(value);
  return cleaned.length > 280 ? cleaned.slice(0, 277).trim() + "..." : cleaned;
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

function ipv4Octets(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets as [number, number, number, number];
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function mappedIpv4Octets(ipv6: string): [number, number, number, number] | null {
  const match = /^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ipv6);
  if (!match) {
    return null;
  }
  const high = Number.parseInt(match[1] as string, 16);
  const low = Number.parseInt(match[2] as string, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isBlockedLiteralHost(hostname: string): boolean {
  const ipv4 = ipv4Octets(hostname);
  if (ipv4) {
    return isBlockedIpv4(ipv4);
  }

  const ipv6 =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1).toLowerCase() : null;
  if (!ipv6) {
    return false;
  }
  const mappedIpv4 = mappedIpv4Octets(ipv6);
  const [firstText = "0", secondText = "0"] = ipv6.split(":");
  const first = Number.parseInt(firstText || "0", 16);
  const second = Number.parseInt(secondText || "0", 16);
  return (
    ipv6 === "::" ||
    ipv6 === "::1" ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && (second === 0x0db8 || second === 0)) ||
    (mappedIpv4 !== null && isBlockedIpv4(mappedIpv4))
  );
}

function normalizePublicUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.startsWith("//") ? "https:" + value : value;
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      isBlockedLiteralHost(hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
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

function normalizeRedditUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    if (value.startsWith("//")) {
      return new URL("https:" + value).toString();
    }
    if (value.startsWith("/")) {
      return new URL(value, "https://www.reddit.com").toString();
    }
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function buildCandidate(input: {
  provider: ProviderIdentifier;
  platform: ResearchPlatform;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  content: string | null;
  summary?: string | null;
  author?: string | null;
  metadata?: SourceCandidateMetadata;
}): NormalizedSourceCandidate | null {
  const url = normalizePublicUrl(input.url);
  if (!url) {
    return null;
  }

  const content = (
    cleanProviderText(input.content ?? "") ||
    cleanProviderText(input.summary ?? "") ||
    cleanProviderText(input.title ?? "")
  ).slice(0, 50_000);
  const title = cleanProviderText(input.title ?? titleFromUrl(url));
  const summary = summarize(input.summary || content);

  if (!content && !summary) {
    return null;
  }

  return {
    provider: input.provider,
    platform: input.platform,
    title: title || titleFromUrl(url),
    url,
    publishedAt: normalizeProviderPublishedAt(input.publishedAt),
    content: content || summary,
    summary,
    ...(input.author ? { author: cleanProviderText(input.author) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function collectText(record: JsonRecord, depth = 0): string {
  const textKeys = [
    "text",
    "body",
    "selftext",
    "message",
    "snippet",
    "description",
    "summary",
    "review_text",
    "intro",
    "about",
    "title",
    "story_text",
    "comment_text",
    "label",
    "timezone",
  ];
  const childKeys = ["comments", "replies", "children"];
  const values = textKeys
    .map((key) => stringValue(record[key]))
    .filter((value): value is string => Boolean(value));

  if (depth < 3) {
    for (const key of childKeys) {
      for (const child of asArray(record[key])) {
        const text = collectText(asRecord(child), depth + 1);
        if (text) {
          values.push(text);
        }
      }
    }
  }

  const metricKeys = [
    "score",
    "points",
    "likes",
    "likeCount",
    "views",
    "viewCount",
    "comments_count",
    "numComments",
    "reactions_count",
    "review_count",
    "subscriber_count",
    "followers_count",
  ];
  const metrics = metricKeys.flatMap((key) => {
    const value = scalarValue(record[key]);
    return value === null ? [] : [key + ": " + String(value)];
  });

  return cleanProviderText(values.concat(metrics).join("\n"));
}

function attributesFromRecord(
  record: JsonRecord,
): Record<string, string | number | boolean | null> {
  const keys = [
    "score",
    "points",
    "likes",
    "likeCount",
    "views",
    "viewCount",
    "comments_count",
    "numComments",
    "reactions_count",
    "review_count",
    "rating",
    "verified",
    "isVerified",
    "subreddit",
    "channel_id",
    "place_id",
    "page_id",
    "delegate_page_id",
    "reels_page_id",
    "group_id",
    "timezone",
    "type",
  ];
  const attributes: Record<string, string | number | boolean | null> = {};

  for (const key of keys) {
    const value = scalarValue(record[key]);
    if (value !== null) {
      attributes[key] = typeof value === "string" ? cleanProviderText(value) : value;
    }
  }

  return attributes;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function normalizeProviderError(
  provider: ProviderIdentifier,
  error: unknown,
): NormalizedProviderError {
  if (error instanceof NormalizedProviderError) {
    return error;
  }
  if (error instanceof Error) {
    return new NormalizedProviderError(provider, "PROVIDER_ERROR", "Provider request failed.");
  }
  return new NormalizedProviderError(provider, "PROVIDER_ERROR", "Provider request failed.");
}

function assertOk(provider: ProviderIdentifier, response: Response, billableUnits = 0): void {
  if (!response.ok) {
    throw new NormalizedProviderError(
      provider,
      response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_HTTP_ERROR",
      provider + " request failed with status " + String(response.status) + ".",
      response.status,
      billableUnits,
    );
  }
}

abstract class LoggedProvider {
  protected constructor(
    protected readonly provider: ProviderIdentifier,
    private readonly logger: ProviderCallLogger | undefined,
  ) {}

  protected async call<T>(
    input: {
      requestId: string;
      platform: ResearchPlatform | null;
      operation: string;
      provider?: ProviderIdentifier;
    },
    task: () => Promise<RawCallResult<T>>,
  ): Promise<ProviderResult<T>> {
    const startedAt = Date.now();
    const provider = input.provider ?? this.provider;

    try {
      const result = await task();
      const usage: ProviderUsage = {
        provider,
        operation: input.operation,
        billableUnits: result.billableUnits,
        ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
        ...(result.cachedInputTokens === undefined
          ? {}
          : { cachedInputTokens: result.cachedInputTokens }),
        ...(result.outputTokens === undefined ? {} : { outputTokens: result.outputTokens }),
        ...(result.totalTokens === undefined ? {} : { totalTokens: result.totalTokens }),
      };

      await this.log({
        contextRequestId: input.requestId,
        provider,
        platform: input.platform,
        operation: input.operation,
        status: "success",
        statusCode: result.statusCode,
        durationMs: Date.now() - startedAt,
        billableUnits: result.billableUnits,
        ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
        ...(result.cachedInputTokens === undefined
          ? {}
          : { cachedInputTokens: result.cachedInputTokens }),
        ...(result.outputTokens === undefined ? {} : { outputTokens: result.outputTokens }),
        ...(result.totalTokens === undefined ? {} : { totalTokens: result.totalTokens }),
      });

      return { data: result.data, usage };
    } catch (error) {
      const normalized = normalizeProviderError(provider, error);
      await this.log({
        contextRequestId: input.requestId,
        provider,
        platform: input.platform,
        operation: input.operation,
        status: "error",
        statusCode: normalized.statusCode,
        durationMs: Date.now() - startedAt,
        billableUnits: normalized.billableUnits,
        ...(normalized.inputTokens === undefined ? {} : { inputTokens: normalized.inputTokens }),
        ...(normalized.cachedInputTokens === undefined
          ? {}
          : { cachedInputTokens: normalized.cachedInputTokens }),
        ...(normalized.outputTokens === undefined ? {} : { outputTokens: normalized.outputTokens }),
        ...(normalized.totalTokens === undefined ? {} : { totalTokens: normalized.totalTokens }),
        errorCode: normalized.errorCode,
        errorMessage: normalized.message,
      });
      throw normalized;
    }
  }

  private async log(input: ProviderCallLogInput): Promise<void> {
    try {
      await this.logger?.(input);
    } catch {
      // Operational logging must not change the provider call outcome.
    }
  }
}

function queryString(params: ProviderParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    query.set(key, Array.isArray(value) ? value.map(String).join(",") : String(value));
  }
  const result = query.toString();
  return result ? "?" + result : "";
}

function requiredParam(params: ProviderParams, key: string): string {
  const value = params[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new NormalizedProviderError(
      "github",
      "INVALID_PROVIDER_INPUT",
      "Missing required provider parameter: " + key + ".",
    );
  }
  const normalized = String(value).trim();
  if (!normalized) {
    throw new NormalizedProviderError(
      "github",
      "INVALID_PROVIDER_INPUT",
      "Missing required provider parameter: " + key + ".",
    );
  }
  return normalized;
}

function withoutParams(params: ProviderParams, keys: readonly string[]): ProviderParams {
  const result = { ...params };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

function firstParam(params: ProviderParams, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = identifierValue(params[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function clampInteger(value: QueryValue, minimum: number, maximum: number): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function firstRecordArray(data: unknown): JsonRecord[] {
  if (Array.isArray(data)) {
    return data.map(asRecord);
  }

  const record = asRecord(data);
  const keys = [
    "results",
    "posts",
    "tweets",
    "comments",
    "replies",
    "users",
    "profiles",
    "communities",
    "subreddits",
    "followers",
    "following",
    "videos",
    "channels",
    "photos",
    "reels",
    "reviews",
    "events",
    "places",
    "articles",
    "items",
    "tree",
    "hits",
    "data",
  ];
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return asArray(record[key]).map(asRecord);
    }
  }

  const singularKeys = [
    "post",
    "tweet",
    "thread",
    "page",
    "group",
    "channel",
    "video",
    "place",
    "user",
    "profile",
    "community",
    "result",
    "data",
  ];
  for (const key of singularKeys) {
    const nested = asRecord(record[key]);
    if (Object.keys(nested).length > 0) {
      return key === "data" || key === "result" ? firstRecordArray(nested) : [nested];
    }
  }

  return Object.keys(record).length > 0 ? [record] : [];
}

class HttpExaClient extends LoggedProvider implements ExaClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.exa,
  ) {
    super("exa", logger);
  }

  async search(input: WebSearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.call(
      { requestId: input.requestId, platform: "web", operation: "search" },
      async () => {
        const response = await fetch(normalizeBaseUrl(this.baseUrl) + "/search", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify({
            query: input.query,
            // The audited Exa search price covers up to ten results.
            numResults: clampInteger(input.limit, 1, 10),
          }),
          signal: AbortSignal.timeout(15_000),
        });
        assertOk("exa", response);
        const data = asRecord(await readJson(response));
        const candidates = asArray(data.results)
          .map((item) => mapExaResult(asRecord(item)))
          .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
        return { data: candidates, statusCode: response.status, billableUnits: 1 };
      },
    );
  }

  async fetchContent(
    input: FetchContentInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    const targets = input.candidates.slice(0, Math.max(0, Math.trunc(input.limit)));
    if (targets.length === 0) {
      return {
        data: [],
        usage: { provider: "exa", operation: "fetch-content", billableUnits: 0 },
      };
    }

    return this.call(
      { requestId: input.requestId, platform: "web", operation: "fetch-content" },
      async () => {
        const response = await fetch(normalizeBaseUrl(this.baseUrl) + "/contents", {
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
          .map((item) => mapExaResult(asRecord(item)))
          .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
        return {
          data: fetched.length > 0 ? fetched : targets,
          statusCode: response.status,
          billableUnits: targets.length,
        };
      },
    );
  }
}

function mapExaResult(item: JsonRecord): NormalizedSourceCandidate | null {
  const url = stringValue(item.url);
  const content =
    stringValue(item.text) ??
    stringValue(item.content) ??
    asArray(item.highlights)
      .map(stringValue)
      .filter((value): value is string => Boolean(value))
      .join("\n");
  return buildCandidate({
    provider: "exa",
    platform: "web",
    title: stringValue(item.title),
    url,
    publishedAt:
      stringValue(item.publishedDate) ??
      stringValue(item.published_at) ??
      stringValue(item.createdAt),
    content,
    summary: stringValue(item.summary) ?? stringValue(item.snippet),
    ...(stringValue(item.id) ? { metadata: { externalId: stringValue(item.id) as string } } : {}),
  });
}

class HttpFetchLayerClient extends LoggedProvider implements FetchLayerClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.fetchlayer,
  ) {
    super("fetchlayer", logger);
  }

  async execute(
    input: FetchLayerExecuteInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.call(
      {
        requestId: input.requestId,
        platform: input.platform,
        operation: input.platform + "." + input.operation,
      },
      async () => {
        const providerPlatform = input.platform === "x" ? "twitter" : "reddit";
        const response = await fetch(
          normalizeBaseUrl(this.baseUrl) + "/" + providerPlatform + "/" + input.operation,
          {
            method: "POST",
            headers: {
              authorization: "Bearer " + this.apiKey,
              "content-type": "application/json",
              "user-agent": "Supacontext",
            },
            body: JSON.stringify(input.params ?? {}),
            signal: AbortSignal.timeout(30_000),
          },
        );
        assertOk("fetchlayer", response);
        const data = await readJson(response);
        return {
          data:
            input.platform === "reddit"
              ? mapFetchLayerReddit(data, input.operation, input.params ?? {})
              : mapFetchLayerX(data, input.operation, input.params ?? {}),
          statusCode: response.status,
          billableUnits: 1,
        };
      },
    );
  }

  async searchReddit(input: SearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.execute({
      requestId: input.requestId,
      platform: "reddit",
      operation: "search",
      params: { query: input.query, limit: input.limit },
    });
  }

  async fetchRedditThread(
    input: RedditThreadFetchInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate>> {
    const result = await this.execute({
      requestId: input.requestId,
      platform: "reddit",
      operation: "post",
      params: {
        url: input.candidate.url,
        ...(input.candidate.metadata?.threadId ? { id: input.candidate.metadata.threadId } : {}),
      },
    });
    return { data: result.data[0] ?? input.candidate, usage: result.usage };
  }

  async searchX(input: SearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.execute({
      requestId: input.requestId,
      platform: "x",
      operation: "search",
      params: { query: input.query, count: input.limit },
    });
  }

  async fetchXPost(input: XFetchInput): Promise<ProviderResult<NormalizedSourceCandidate>> {
    const result = await this.execute({
      requestId: input.requestId,
      platform: "x",
      operation: "tweet-detail",
      params: {
        ...(input.candidate.metadata?.postId
          ? { tweetId: input.candidate.metadata.postId }
          : { url: input.candidate.url }),
      },
    });
    return { data: result.data[0] ?? input.candidate, usage: result.usage };
  }
}

function mapFetchLayerReddit(
  data: unknown,
  operation: RedditOperation,
  params: ProviderParams,
): NormalizedSourceCandidate[] {
  return firstRecordArray(data)
    .map((item) => {
      const subreddit =
        stringValue(item.subreddit) ??
        stringValue(item.display_name) ??
        stringValue(item.community) ??
        firstParam(params, ["subreddit", "community"]);
      const author =
        stringValue(item.author) ??
        stringValue(item.username) ??
        stringValue(item.name) ??
        firstParam(params, ["username", "user"]);
      const externalId =
        identifierValue(item.id) ?? identifierValue(item.postId) ?? identifierValue(item.post_id);
      let url =
        normalizeRedditUrl(stringValue(item.url)) ??
        normalizeRedditUrl(stringValue(item.permalink)) ??
        normalizeRedditUrl(firstParam(params, ["url", "permalink"]));

      if (!url && operation.includes("community") && subreddit) {
        url = "https://www.reddit.com/r/" + encodeURIComponent(subreddit);
      }
      if (!url && (operation.includes("user") || operation === "search-users") && author) {
        url = "https://www.reddit.com/user/" + encodeURIComponent(author);
      }
      if (!url && externalId) {
        url = "https://www.reddit.com/comments/" + encodeURIComponent(externalId);
      }

      return buildCandidate({
        provider: "fetchlayer",
        platform: "reddit",
        title:
          stringValue(item.title) ??
          (subreddit ? "r/" + subreddit : null) ??
          (author ? "Reddit user " + author : "Reddit result"),
        url,
        publishedAt:
          stringValue(item.created_utc) ??
          stringValue(item.createdAt) ??
          stringValue(item.published_at) ??
          (numberValue(item.created_utc) === null ? null : String(numberValue(item.created_utc))) ??
          (numberValue(item.created) === null ? null : String(numberValue(item.created))),
        content: collectText(item),
        summary: stringValue(item.summary) ?? stringValue(item.snippet),
        author,
        metadata: {
          ...(externalId ? { externalId, threadId: externalId } : {}),
          attributes: attributesFromRecord(item),
        },
      });
    })
    .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
}

function xAuthor(item: JsonRecord): { handle: string | null; displayName: string | null } {
  const nested = asRecord(item.author ?? item.user);
  return {
    handle:
      stringValue(item.handle) ??
      stringValue(item.username) ??
      stringValue(item.screen_name) ??
      stringValue(nested.handle) ??
      stringValue(nested.username) ??
      stringValue(nested.screen_name),
    displayName:
      stringValue(item.displayName) ??
      stringValue(item.name) ??
      stringValue(nested.displayName) ??
      stringValue(nested.name),
  };
}

function mapFetchLayerX(
  data: unknown,
  operation: XOperation,
  params: ProviderParams,
): NormalizedSourceCandidate[] {
  return firstRecordArray(data)
    .map((item) => {
      const author = xAuthor(item);
      author.handle ??= firstParam(params, ["username", "handle", "screen_name"]);
      const externalId =
        identifierValue(item.id) ??
        identifierValue(item.tweetId) ??
        identifierValue(item.tweet_id) ??
        identifierValue(item.rest_id) ??
        firstParam(params, ["tweetId", "tweet_id", "id"]);
      const isProfileOperation =
        operation.includes("profile") ||
        operation === "followers" ||
        operation === "following" ||
        operation === "verified-followers";
      let url =
        stringValue(item.url) ??
        stringValue(item.link) ??
        normalizePublicUrl(firstParam(params, ["url"]));

      if (!url && externalId && author.handle && !isProfileOperation) {
        url =
          "https://x.com/" +
          encodeURIComponent(author.handle) +
          "/status/" +
          encodeURIComponent(externalId);
      }
      if (!url && author.handle) {
        url = "https://x.com/" + encodeURIComponent(author.handle);
      }

      return buildCandidate({
        provider: "fetchlayer",
        platform: "x",
        title:
          stringValue(item.title) ??
          (author.displayName || author.handle
            ? (isProfileOperation ? "X profile " : "X post by ") +
              (author.displayName ?? author.handle)
            : "X result"),
        url,
        publishedAt:
          stringValue(item.created_at) ??
          stringValue(item.createdAt) ??
          stringValue(item.published_at),
        content: collectText(item),
        summary: stringValue(item.summary),
        author: author.handle ?? author.displayName,
        metadata: {
          ...(externalId ? { externalId, postId: externalId } : {}),
          attributes: attributesFromRecord(item),
        },
      });
    })
    .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
}

type ApiDirectDefinition = {
  route: string;
  platform: ResearchPlatform;
  usageOperation: string;
  billedByPages: boolean;
  maxPages?: number;
  maxLimit?: number;
};

const apiDirectDefinitions: Record<ApiDirectOperation, ApiDirectDefinition> = {
  "facebook.page": {
    route: "/v1/facebook/page",
    platform: "facebook",
    usageOperation: "facebook.page-details",
    billedByPages: false,
  },
  "facebook.page_posts": {
    route: "/v1/facebook/page/posts",
    platform: "facebook",
    usageOperation: "facebook.page-posts",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.page_photos": {
    route: "/v1/facebook/page/photos",
    platform: "facebook",
    usageOperation: "facebook.page-photos",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.page_videos": {
    route: "/v1/facebook/page/videos",
    platform: "facebook",
    usageOperation: "facebook.page-videos",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.page_reels": {
    route: "/v1/facebook/page/reels",
    platform: "facebook",
    usageOperation: "facebook.page-reels",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.page_reviews": {
    route: "/v1/facebook/page/reviews",
    platform: "facebook",
    usageOperation: "facebook.page-reviews",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.group": {
    route: "/v1/facebook/group",
    platform: "facebook",
    usageOperation: "facebook.group-details",
    billedByPages: false,
  },
  "facebook.group_posts": {
    route: "/v1/facebook/group/posts",
    platform: "facebook",
    usageOperation: "facebook.group-posts",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.group_search": {
    route: "/v1/facebook/group/search",
    platform: "facebook",
    usageOperation: "facebook.search-group-posts",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.post_comments": {
    route: "/v1/facebook/post/comments",
    platform: "facebook",
    usageOperation: "facebook.post-comments",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.search_posts": {
    route: "/v1/facebook/posts",
    platform: "facebook",
    usageOperation: "facebook.search-posts",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.search_pages": {
    route: "/v1/facebook/pages",
    platform: "facebook",
    usageOperation: "facebook.search-pages",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.search_videos": {
    route: "/v1/facebook/videos",
    platform: "facebook",
    usageOperation: "facebook.search-videos",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.search_events": {
    route: "/v1/facebook/events",
    platform: "facebook",
    usageOperation: "facebook.search-events",
    billedByPages: true,
    maxPages: 10,
  },
  "facebook.search_locations": {
    route: "/v1/facebook/locations",
    platform: "facebook",
    usageOperation: "facebook.search-locations",
    billedByPages: false,
  },
  "youtube.search_videos": {
    route: "/v1/youtube/posts",
    platform: "youtube",
    usageOperation: "youtube.search-videos",
    billedByPages: true,
    maxPages: 10,
  },
  "youtube.search_channels": {
    route: "/v1/youtube/channels",
    platform: "youtube",
    usageOperation: "youtube.search-channels",
    billedByPages: true,
    maxPages: 10,
  },
  "youtube.channel": {
    route: "/v1/youtube/channel",
    platform: "youtube",
    usageOperation: "youtube.channel-details",
    billedByPages: false,
  },
  "youtube.video": {
    route: "/v1/youtube/video",
    platform: "youtube",
    usageOperation: "youtube.video-details",
    billedByPages: false,
  },
  "youtube.comments": {
    route: "/v1/youtube/comments",
    platform: "youtube",
    usageOperation: "youtube.video-comments",
    billedByPages: true,
    maxPages: 10,
  },
  "news.search": {
    route: "/v1/news/articles",
    platform: "news",
    usageOperation: "news.news-articles",
    billedByPages: false,
    maxLimit: 100,
  },
  "forums.search": {
    route: "/v1/forums/posts",
    platform: "forums",
    usageOperation: "forums.forum-posts",
    billedByPages: false,
  },
  "places.search": {
    route: "/v1/places/search",
    platform: "places",
    usageOperation: "places.places-search",
    billedByPages: true,
    maxPages: 20,
  },
  "places.details": {
    route: "/v1/places/details",
    platform: "places",
    usageOperation: "places.place-details",
    billedByPages: false,
  },
  "places.reviews": {
    route: "/v1/places/reviews",
    platform: "places",
    usageOperation: "places.place-reviews",
    billedByPages: true,
    maxPages: 10,
  },
  "places.photos": {
    route: "/v1/places/photos",
    platform: "places",
    usageOperation: "places.place-photos",
    billedByPages: true,
    maxPages: 10,
  },
  "linkedin.search_posts": {
    route: "/v1/linkedin/posts",
    platform: "linkedin",
    usageOperation: "linkedin.search-posts",
    billedByPages: false,
  },
};

function sanitizeApiDirectParams(
  definition: ApiDirectDefinition,
  input: ProviderParams,
): { params: ProviderParams; billableUnits: number } {
  const params = { ...input };

  // Emotion analysis is a separately priced add-on and is intentionally not enabled
  // through this research adapter until it has its own budgeted operation.
  delete params.get_sentiment;

  let billableUnits = 1;
  if (definition.maxPages !== undefined) {
    const pages = clampInteger(params.pages, 1, definition.maxPages);
    params.pages = pages;
    if (definition.billedByPages) {
      billableUnits = pages;
    }
  }
  if (definition.maxLimit !== undefined) {
    params.limit = clampInteger(params.limit ?? 10, 1, definition.maxLimit);
  }
  if (definition.platform === "forums" && params.page !== undefined) {
    params.page = Math.max(1, clampInteger(params.page, 1, Number.MAX_SAFE_INTEGER));
  }

  return { params, billableUnits };
}

class HttpApiDirectClient extends LoggedProvider implements ApiDirectClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.apiDirect,
  ) {
    super("api_direct", logger);
  }

  async execute(
    input: ApiDirectExecuteInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    const definition = apiDirectDefinitions[input.operation];
    const sanitized = sanitizeApiDirectParams(definition, input.params ?? {});

    return this.call(
      {
        requestId: input.requestId,
        platform: definition.platform,
        operation: definition.usageOperation,
      },
      async () => {
        const response = await fetch(
          normalizeBaseUrl(this.baseUrl) + definition.route + queryString(sanitized.params),
          {
            method: "GET",
            headers: {
              "x-api-key": this.apiKey,
              "user-agent": "Supacontext",
            },
            signal: AbortSignal.timeout(30_000),
          },
        );
        // API Direct documents failed 4xx/5xx requests as unbilled.
        assertOk("api_direct", response, 0);
        const data = await readJson(response);
        return {
          data: mapApiDirect(data, input.operation, definition.platform),
          statusCode: response.status,
          billableUnits: sanitized.billableUnits,
        };
      },
    );
  }
}

function apiDirectUrl(item: JsonRecord): string | null {
  return (
    stringValue(item.url) ??
    stringValue(item.link) ??
    stringValue(item.post_url) ??
    stringValue(item.video_url) ??
    stringValue(item.place_link) ??
    stringValue(item.review_link) ??
    stringValue(item.image_url) ??
    stringValue(item.photo_url) ??
    stringValue(item.author_url)
  );
}

function mapApiDirect(
  data: unknown,
  operation: ApiDirectOperation,
  platform: ResearchPlatform,
): NormalizedSourceCandidate[] {
  return firstRecordArray(data)
    .map((item) => {
      const author =
        stringValue(item.author) ??
        stringValue(item.author_name) ??
        stringValue(item.channel_name) ??
        asArray(item.authors)
          .map(stringValue)
          .filter((value): value is string => Boolean(value))
          .join(", ");
      const externalId =
        identifierValue(item.post_id) ??
        identifierValue(item.video_id) ??
        identifierValue(item.channel_id) ??
        identifierValue(item.place_id) ??
        identifierValue(item.event_id) ??
        identifierValue(item.review_id) ??
        identifierValue(item.facebook_id) ??
        identifierValue(item.page_id) ??
        identifierValue(item.group_id) ??
        identifierValue(item.id);
      const url =
        apiDirectUrl(item) ??
        (operation === "facebook.search_locations" && externalId
          ? "https://www.facebook.com/" + encodeURIComponent(externalId)
          : null);
      const title =
        stringValue(item.title) ??
        stringValue(item.name) ??
        stringValue(item.label) ??
        stringValue(item.channel_name) ??
        stringValue(item.message) ??
        stringValue(item.review_text) ??
        (author ? operation + " by " + author : operation);
      const published =
        stringValue(item.date) ??
        stringValue(item.published_datetime_utc) ??
        stringValue(item.review_datetime_utc) ??
        stringValue(item.photo_datetime_utc) ??
        stringValue(item.created_at) ??
        stringValue(item.created_time) ??
        (numberValue(item.timestamp) === null ? null : String(numberValue(item.timestamp))) ??
        (numberValue(item.review_timestamp) === null
          ? null
          : String(numberValue(item.review_timestamp))) ??
        (numberValue(item.photo_timestamp) === null
          ? null
          : String(numberValue(item.photo_timestamp)));

      return buildCandidate({
        provider: "api_direct",
        platform,
        title,
        url,
        publishedAt: published,
        content: collectText(item),
        summary:
          stringValue(item.snippet) ?? stringValue(item.summary) ?? stringValue(item.description),
        author: author || null,
        metadata: {
          ...(externalId ? { externalId } : {}),
          ...(stringValue(item.video_id) ? { videoId: stringValue(item.video_id) as string } : {}),
          ...(stringValue(item.post_id) ? { postId: stringValue(item.post_id) as string } : {}),
          attributes: attributesFromRecord(item),
        },
      });
    })
    .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
}

function hackerNewsProvider(operation: HackerNewsOperation): ProviderIdentifier {
  return operation.startsWith("algolia.") ? "hacker_news_algolia" : "hacker_news_firebase";
}

function hackerNewsUsageOperation(operation: HackerNewsOperation): string {
  const operations: Record<HackerNewsOperation, string> = {
    "algolia.search": "search",
    "algolia.search_by_date": "search-by-date",
    "algolia.item": "item",
    "algolia.user": "user",
    "firebase.item": "item",
    "firebase.user": "user",
    "firebase.top": "top-stories",
    "firebase.new": "new-stories",
    "firebase.best": "best-stories",
    "firebase.ask": "ask-stories",
    "firebase.show": "show-stories",
    "firebase.job": "job-stories",
    "firebase.updates": "updates",
  };
  return operations[operation];
}

function hackerNewsPlatformUrl(id: string | number): string {
  return "https://news.ycombinator.com/item?id=" + encodeURIComponent(String(id));
}

function hackerNewsUserUrl(username: string): string {
  return "https://news.ycombinator.com/user?id=" + encodeURIComponent(username);
}

class HttpHackerNewsClient extends LoggedProvider implements HackerNewsClient {
  constructor(
    logger: ProviderCallLogger | undefined,
    private readonly algoliaBaseUrl: string = defaultBaseUrls.hackerNewsAlgolia,
    private readonly firebaseBaseUrl: string = defaultBaseUrls.hackerNewsFirebase,
  ) {
    super("hacker_news_algolia", logger);
  }

  async execute(
    input: HackerNewsExecuteInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    const provider = hackerNewsProvider(input.operation);
    const params = input.params ?? {};

    return this.call(
      {
        requestId: input.requestId,
        platform: "hackernews",
        operation: hackerNewsUsageOperation(input.operation),
        provider,
      },
      async () => {
        const url =
          provider === "hacker_news_algolia"
            ? this.algoliaUrl(input.operation, params)
            : this.firebaseUrl(input.operation, params);
        const response = await fetch(url, {
          method: "GET",
          headers: { "user-agent": "Supacontext" },
          signal: AbortSignal.timeout(20_000),
        });
        assertOk(provider, response);
        const data = await readJson(response);
        return {
          data: mapHackerNews(data, input.operation),
          statusCode: response.status,
          // Deliberately nonzero even though both upstream APIs are free.
          billableUnits: 1,
        };
      },
    );
  }

  private algoliaUrl(operation: HackerNewsOperation, params: ProviderParams): string {
    const base = normalizeBaseUrl(this.algoliaBaseUrl);
    if (operation === "algolia.search" || operation === "algolia.search_by_date") {
      const route = operation === "algolia.search" ? "/search" : "/search_by_date";
      return base + route + queryString(params);
    }
    if (operation === "algolia.item") {
      const id = requiredHackerNewsParam(params, "id", "hacker_news_algolia");
      return base + "/items/" + encodeURIComponent(id);
    }
    if (operation === "algolia.user") {
      const username = requiredHackerNewsParam(params, "username", "hacker_news_algolia");
      return base + "/users/" + encodeURIComponent(username);
    }
    throw new NormalizedProviderError(
      "hacker_news_algolia",
      "INVALID_PROVIDER_INPUT",
      "Invalid Algolia operation.",
    );
  }

  private firebaseUrl(operation: HackerNewsOperation, params: ProviderParams): string {
    const base = normalizeBaseUrl(this.firebaseBaseUrl);
    if (operation === "firebase.item") {
      const id = requiredHackerNewsParam(params, "id", "hacker_news_firebase");
      return base + "/item/" + encodeURIComponent(id) + ".json";
    }
    if (operation === "firebase.user") {
      const username = requiredHackerNewsParam(params, "username", "hacker_news_firebase");
      return base + "/user/" + encodeURIComponent(username) + ".json";
    }
    const feeds: Partial<Record<HackerNewsOperation, string>> = {
      "firebase.top": "topstories",
      "firebase.new": "newstories",
      "firebase.best": "beststories",
      "firebase.ask": "askstories",
      "firebase.show": "showstories",
      "firebase.job": "jobstories",
      "firebase.updates": "updates",
    };
    const route = feeds[operation];
    if (!route) {
      throw new NormalizedProviderError(
        "hacker_news_firebase",
        "INVALID_PROVIDER_INPUT",
        "Invalid Firebase operation.",
      );
    }
    return base + "/" + route + ".json";
  }
}

function requiredHackerNewsParam(
  params: ProviderParams,
  key: string,
  provider: Extract<ProviderIdentifier, "hacker_news_algolia" | "hacker_news_firebase">,
): string {
  const value = params[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new NormalizedProviderError(
      provider,
      "INVALID_PROVIDER_INPUT",
      "Missing required Hacker News parameter: " + key + ".",
    );
  }
  return String(value);
}

function mapHackerNews(data: unknown, operation: HackerNewsOperation): NormalizedSourceCandidate[] {
  const provider = hackerNewsProvider(operation);

  if (
    operation === "firebase.top" ||
    operation === "firebase.new" ||
    operation === "firebase.best" ||
    operation === "firebase.ask" ||
    operation === "firebase.show" ||
    operation === "firebase.job"
  ) {
    return asArray(data).flatMap((value) => {
      const id = typeof value === "number" || typeof value === "string" ? value : null;
      if (id === null) {
        return [];
      }
      const candidate = buildCandidate({
        provider,
        platform: "hackernews",
        title: "Hacker News item " + String(id),
        url: hackerNewsPlatformUrl(id),
        publishedAt: null,
        content: "Hacker News item " + String(id) + " appeared in the " + operation + " feed.",
        metadata: { externalId: String(id) },
      });
      return candidate ? [candidate] : [];
    });
  }

  if (operation === "firebase.updates") {
    const record = asRecord(data);
    const items = asArray(record.items).flatMap((value) => {
      if (typeof value !== "number" && typeof value !== "string") {
        return [];
      }
      const candidate = buildCandidate({
        provider,
        platform: "hackernews",
        title: "Updated Hacker News item " + String(value),
        url: hackerNewsPlatformUrl(value),
        publishedAt: null,
        content: "This Hacker News item recently changed.",
        metadata: { externalId: String(value) },
      });
      return candidate ? [candidate] : [];
    });
    const users = asArray(record.profiles).flatMap((value) => {
      const username = stringValue(value);
      if (!username) {
        return [];
      }
      const candidate = buildCandidate({
        provider,
        platform: "hackernews",
        title: "Hacker News user " + username,
        url: hackerNewsUserUrl(username),
        publishedAt: null,
        content: "This Hacker News profile recently changed.",
        author: username,
        metadata: { externalId: username },
      });
      return candidate ? [candidate] : [];
    });
    return items.concat(users);
  }

  if (operation.endsWith(".user")) {
    const record = asRecord(data);
    if (Object.keys(record).length === 0) {
      return [];
    }
    const username = stringValue(record.username) ?? stringValue(record.id) ?? "unknown";
    const candidate = buildCandidate({
      provider,
      platform: "hackernews",
      title: "Hacker News user " + username,
      url: hackerNewsUserUrl(username),
      publishedAt:
        numberValue(record.created) === null ? null : String(numberValue(record.created)),
      content: collectText(record) + " karma: " + String(numberValue(record.karma) ?? 0),
      author: username,
      metadata: { externalId: username },
    });
    return candidate ? [candidate] : [];
  }

  const records =
    operation === "algolia.search" || operation === "algolia.search_by_date"
      ? asArray(asRecord(data).hits).map(asRecord)
      : [asRecord(data)];

  return records
    .map((item) => mapHackerNewsItem(item, provider))
    .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
}

function mapHackerNewsItem(
  item: JsonRecord,
  provider: ProviderIdentifier,
): NormalizedSourceCandidate | null {
  const id =
    stringValue(item.objectID) ??
    stringValue(item.id) ??
    (numberValue(item.id) === null ? null : String(numberValue(item.id)));
  const author = stringValue(item.author) ?? stringValue(item.by);
  const externalUrl =
    stringValue(item.url) ?? stringValue(item.story_url) ?? (id ? hackerNewsPlatformUrl(id) : null);
  const childrenText = asArray(item.children)
    .map((child) => collectText(asRecord(child)))
    .filter(Boolean)
    .join("\n");
  const content = [collectText(item), childrenText].filter(Boolean).join("\n");
  return buildCandidate({
    provider,
    platform: "hackernews",
    title:
      stringValue(item.title) ??
      stringValue(item.story_title) ??
      (id ? "Hacker News item " + id : "Hacker News result"),
    url: externalUrl,
    publishedAt:
      stringValue(item.created_at) ??
      (numberValue(item.time) === null ? null : String(numberValue(item.time))),
    content,
    author,
    metadata: {
      ...(id ? { externalId: id, threadId: id } : {}),
      attributes: attributesFromRecord(item),
    },
  });
}

class HttpGitHubClient extends LoggedProvider implements GitHubClient {
  constructor(
    private readonly pat: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.github,
  ) {
    super("github", logger);
  }

  async execute(input: GitHubExecuteInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "github",
        operation: githubUsageOperation(input.operation),
      },
      async () => {
        const request = githubRequest(input.operation, input.params ?? {});
        const response = await fetch(
          normalizeBaseUrl(this.baseUrl) + request.path + queryString(request.query),
          {
            method: "GET",
            headers: {
              accept: "application/vnd.github+json",
              authorization: "Bearer " + this.pat,
              "user-agent": "Supacontext",
              "x-github-api-version": "2026-03-10",
            },
            signal: AbortSignal.timeout(30_000),
          },
        );
        assertOk("github", response);
        assertPublicOnlyGitHubScopes(response);
        const data = await readJson(response);
        return {
          data: mapGitHub(data, input.operation, input.params ?? {}),
          statusCode: response.status,
          // Deliberately nonzero even though GitHub has no per-request upstream fee.
          billableUnits: 1,
        };
      },
    );
  }
}

function assertPublicOnlyGitHubScopes(response: Response): void {
  const scopes = (response.headers.get("x-oauth-scopes") ?? "")
    .split(",")
    .map((scope) => scope.trim().toLowerCase())
    .filter(Boolean);
  if (scopes.some((scope) => scope === "repo" || scope.startsWith("repo:"))) {
    throw new NormalizedProviderError(
      "github",
      "GITHUB_TOKEN_PRIVATE_SCOPE",
      GITHUB_TOKEN_REQUIREMENT,
      response.status,
      1,
    );
  }
}

function githubUsageOperation(operation: GitHubOperation): string {
  const operations: Record<GitHubOperation, string> = {
    "search.repositories": "search-repositories",
    "search.code": "search-code",
    "search.issues": "search-issues-and-pull-requests",
    "search.commits": "search-commits",
    "search.users": "search-users",
    "search.topics": "search-topics",
    user: "user",
    "repo.get": "repository",
    "repo.readme": "repository-readme",
    "repo.contents": "repository-contents",
    "repo.tree": "repository-tree",
    "repo.languages": "repository-languages",
    "repo.topics": "repository-topics",
    "repo.commits": "commits",
    "repo.releases": "releases",
    "repo.contributors": "contributors",
    "repo.issues": "issues",
    "repo.issue_comments": "issue-comments",
    "repo.pulls": "pull-requests",
    "repo.pull": "pull-request",
    "repo.pull_reviews": "pull-request-reviews",
    "repo.pull_review_comments": "pull-request-review-comments",
  };
  return operations[operation];
}

function githubRequest(
  operation: GitHubOperation,
  params: ProviderParams,
): { path: string; query: ProviderParams } {
  const searchRoutes: Partial<Record<GitHubOperation, string>> = {
    "search.repositories": "/search/repositories",
    "search.code": "/search/code",
    "search.issues": "/search/issues",
    "search.commits": "/search/commits",
    "search.users": "/search/users",
    "search.topics": "/search/topics",
  };
  const searchRoute = searchRoutes[operation];
  if (searchRoute) {
    const query = clampGitHubPagination(params);
    const value = requiredParam(params, "q");
    if (/\b(?:is|visibility):private\b/i.test(value)) {
      throw new NormalizedProviderError(
        "github",
        "INVALID_PROVIDER_INPUT",
        "GitHub searches are restricted to public repositories.",
      );
    }
    if (operation === "search.repositories") {
      query.q = /\bis:public\b/i.test(value) ? value : value + " is:public";
    }
    return { path: searchRoute, query };
  }

  if (operation === "user") {
    const username = requiredParam(params, "username");
    return {
      path: "/users/" + encodeURIComponent(username),
      query: withoutParams(params, ["username"]),
    };
  }

  const owner = requiredParam(params, "owner");
  const repo = requiredParam(params, "repo");
  const base = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
  const query = withoutParams(params, ["owner", "repo"]);

  switch (operation) {
    case "repo.get":
      return { path: base, query };
    case "repo.readme":
      return { path: base + "/readme", query };
    case "repo.contents": {
      const pathValue = firstParam(params, ["path"]);
      const encodedPath = pathValue
        ? "/" + pathValue.split("/").map(encodeURIComponent).join("/")
        : "";
      return {
        path: base + "/contents" + encodedPath,
        query: withoutParams(query, ["path"]),
      };
    }
    case "repo.tree": {
      const treeSha = requiredParam(params, "tree_sha");
      return {
        path: base + "/git/trees/" + encodeURIComponent(treeSha),
        query: {
          ...withoutParams(query, ["tree_sha"]),
          ...(params.recursive ? { recursive: 1 } : {}),
        },
      };
    }
    case "repo.languages":
      return { path: base + "/languages", query };
    case "repo.topics":
      return { path: base + "/topics", query };
    case "repo.commits":
      return { path: base + "/commits", query: clampGitHubPagination(query) };
    case "repo.releases":
      return { path: base + "/releases", query: clampGitHubPagination(query) };
    case "repo.contributors":
      return { path: base + "/contributors", query: clampGitHubPagination(query) };
    case "repo.issues":
      return { path: base + "/issues", query: clampGitHubPagination(query) };
    case "repo.issue_comments": {
      const issueNumber = requiredParam(params, "issue_number");
      return {
        path: base + "/issues/" + encodeURIComponent(issueNumber) + "/comments",
        query: clampGitHubPagination(withoutParams(query, ["issue_number"])),
      };
    }
    case "repo.pulls":
      return { path: base + "/pulls", query: clampGitHubPagination(query) };
    case "repo.pull": {
      const pullNumber = requiredParam(params, "pull_number");
      return {
        path: base + "/pulls/" + encodeURIComponent(pullNumber),
        query: withoutParams(query, ["pull_number"]),
      };
    }
    case "repo.pull_reviews": {
      const pullNumber = requiredParam(params, "pull_number");
      return {
        path: base + "/pulls/" + encodeURIComponent(pullNumber) + "/reviews",
        query: clampGitHubPagination(withoutParams(query, ["pull_number"])),
      };
    }
    case "repo.pull_review_comments": {
      const pullNumber = requiredParam(params, "pull_number");
      return {
        path: base + "/pulls/" + encodeURIComponent(pullNumber) + "/comments",
        query: clampGitHubPagination(withoutParams(query, ["pull_number"])),
      };
    }
  }

  throw new NormalizedProviderError(
    "github",
    "INVALID_PROVIDER_OPERATION",
    "Unsupported GitHub operation: " + operation + ".",
  );
}

function clampGitHubPagination(params: ProviderParams): ProviderParams {
  const result = { ...params };
  if (params.per_page !== undefined) {
    result.per_page = clampInteger(params.per_page, 1, 100);
  }
  if (params.page !== undefined) {
    result.page = Math.max(1, clampInteger(params.page, 1, Number.MAX_SAFE_INTEGER));
  }
  return result;
}

function githubRepositoryUrl(params: ProviderParams): string | null {
  const owner = params.owner;
  const repo = params.repo;
  if (
    (typeof owner !== "string" && typeof owner !== "number") ||
    (typeof repo !== "string" && typeof repo !== "number")
  ) {
    return null;
  }
  return (
    "https://github.com/" +
    encodeURIComponent(String(owner)) +
    "/" +
    encodeURIComponent(String(repo))
  );
}

function mapGitHub(
  data: unknown,
  operation: GitHubOperation,
  params: ProviderParams,
): NormalizedSourceCandidate[] {
  if (operation === "repo.languages") {
    const repositoryUrl = githubRepositoryUrl(params);
    const record = asRecord(data);
    const content = Object.entries(record)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([language, bytes]) => language + ": " + String(bytes) + " bytes")
      .join("\n");
    const candidate = buildCandidate({
      provider: "github",
      platform: "github",
      title: "Repository languages",
      url: repositoryUrl,
      publishedAt: null,
      content,
    });
    return candidate ? [candidate] : [];
  }

  if (operation === "repo.topics") {
    const repositoryUrl = githubRepositoryUrl(params);
    const names = asArray(asRecord(data).names)
      .map(stringValue)
      .filter((value): value is string => Boolean(value));
    const candidate = buildCandidate({
      provider: "github",
      platform: "github",
      title: "Repository topics",
      url: repositoryUrl,
      publishedAt: null,
      content: names.join(", "),
    });
    return candidate ? [candidate] : [];
  }

  const records = firstRecordArray(data).filter((item) => !isPrivateGitHubItem(item));
  return records
    .map((item) => mapGitHubItem(item, operation, params))
    .filter((candidate): candidate is NormalizedSourceCandidate => Boolean(candidate));
}

function isPrivateGitHubItem(item: JsonRecord): boolean {
  const records = [
    item,
    asRecord(item.repository),
    asRecord(asRecord(item.base).repo),
    asRecord(asRecord(item.head).repo),
  ];
  return records.some(
    (record) =>
      record.private === true || stringValue(record.visibility)?.toLowerCase() === "private",
  );
}

function decodeGitHubContent(item: JsonRecord): string | null {
  const content = stringValue(item.content);
  if (!content || stringValue(item.encoding) !== "base64") {
    return content;
  }
  try {
    return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
  } catch {
    return null;
  }
}

function mapGitHubItem(
  item: JsonRecord,
  operation: GitHubOperation,
  params: ProviderParams,
): NormalizedSourceCandidate | null {
  const repository = asRecord(item.repository);
  const commit = asRecord(item.commit);
  const owner = asRecord(item.owner);
  const user = asRecord(item.user);
  const repositoryUrl = githubRepositoryUrl(params);
  let url =
    stringValue(item.html_url) ??
    stringValue(item.url) ??
    stringValue(repository.html_url) ??
    repositoryUrl;

  if (operation === "repo.tree" && repositoryUrl && stringValue(item.path)) {
    const reference =
      typeof params.tree_sha === "string" || typeof params.tree_sha === "number"
        ? String(params.tree_sha)
        : (stringValue(item.sha) ?? "HEAD");
    const kind = stringValue(item.type) === "tree" ? "tree" : "blob";
    url =
      repositoryUrl +
      "/" +
      kind +
      "/" +
      encodeURIComponent(reference) +
      "/" +
      (stringValue(item.path) as string).split("/").map(encodeURIComponent).join("/");
  }

  const decodedContent = decodeGitHubContent(item);
  const author =
    stringValue(user.login) ??
    stringValue(owner.login) ??
    stringValue(asRecord(commit.author).name) ??
    stringValue(item.login);
  const externalId =
    stringValue(item.node_id) ??
    stringValue(item.sha) ??
    stringValue(item.id) ??
    (numberValue(item.id) === null ? null : String(numberValue(item.id)));
  const content = [
    decodedContent,
    stringValue(item.body),
    stringValue(item.description),
    stringValue(item.bio),
    stringValue(item.message),
    stringValue(commit.message),
    collectText(item),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const published =
    stringValue(item.published_at) ??
    stringValue(item.created_at) ??
    stringValue(item.updated_at) ??
    stringValue(asRecord(commit.author).date);

  return buildCandidate({
    provider: "github",
    platform: "github",
    title:
      stringValue(item.title) ??
      stringValue(item.name) ??
      stringValue(item.full_name) ??
      stringValue(item.path) ??
      stringValue(commit.message) ??
      stringValue(item.login) ??
      operation,
    url,
    publishedAt: published,
    content,
    summary: stringValue(item.description) ?? stringValue(item.body_text) ?? stringValue(item.bio),
    author,
    metadata: {
      ...(externalId ? { externalId } : {}),
      attributes: attributesFromRecord(item),
    },
  });
}

function supadataBillableRequests(response: Response): number {
  const raw = response.headers.get("x-billable-requests");
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return response.ok ? 1 : 0;
}

function normalizeTranscriptSegments(data: JsonRecord): TranscriptSegment[] {
  const nested = asRecord(data.data);
  const segmentSource = asArray(
    data.content ??
      data.segments ??
      data.transcript ??
      nested.content ??
      nested.segments ??
      nested.transcript,
  );

  return segmentSource
    .map((item) => {
      const record = asRecord(item);
      const text = stringValue(record.text) ?? stringValue(record.content);
      const startSeconds = numberValue(record.start_seconds) ?? numberValue(record.start);
      const offsetMilliseconds = numberValue(record.offset);
      const start =
        startSeconds ?? (offsetMilliseconds === null ? null : offsetMilliseconds / 1_000);
      const endSeconds = numberValue(record.end_seconds) ?? numberValue(record.end);
      const duration = numberValue(record.duration);
      const normalizedDuration =
        duration === null ? null : offsetMilliseconds === null ? duration : duration / 1_000;

      if (!text || start === null) {
        return null;
      }

      return {
        text: cleanProviderText(text),
        startSeconds: start,
        endSeconds: endSeconds ?? (normalizedDuration === null ? null : start + normalizedDuration),
      };
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment));
}

function transcriptText(data: JsonRecord, segments: TranscriptSegment[]): string | null {
  const nested = asRecord(data.data);
  return (
    stringValue(data.content) ??
    stringValue(data.transcript) ??
    stringValue(data.text) ??
    stringValue(nested.content) ??
    stringValue(nested.transcript) ??
    stringValue(nested.text) ??
    (segments.length > 0 ? segments.map((segment) => segment.text).join("\n") : null)
  );
}

class HttpSupadataClient extends LoggedProvider implements SupadataClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.supadata,
  ) {
    super("supadata", logger);
  }

  async fetchTranscript(
    input: TranscriptFetchInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate>> {
    const sourceUrl = normalizePublicUrl(input.url);
    if (!sourceUrl) {
      throw new NormalizedProviderError(
        "supadata",
        "INVALID_PROVIDER_INPUT",
        "Transcript URL must use HTTP or HTTPS.",
      );
    }

    return this.call(
      {
        requestId: input.requestId,
        platform: "youtube",
        operation: "youtube.transcript",
      },
      async () => {
        const query = new URLSearchParams({ url: sourceUrl, mode: "native" });
        if (input.lang) {
          query.set("lang", input.lang);
        }
        const response = await fetch(
          normalizeBaseUrl(this.baseUrl) + "/transcript?" + query.toString(),
          {
            method: "GET",
            headers: {
              "x-api-key": this.apiKey,
              "user-agent": "Supacontext",
            },
            signal: AbortSignal.timeout(30_000),
          },
        );
        const billableUnits = supadataBillableRequests(response);
        assertOk("supadata", response, billableUnits);

        const data = asRecord(await readJson(response));
        const nested = asRecord(data.data);
        const segments = normalizeTranscriptSegments(data);
        const content = transcriptText(data, segments);
        if (!content || !cleanProviderText(content)) {
          throw new NormalizedProviderError(
            "supadata",
            "TRANSCRIPT_EMPTY",
            "Supadata returned an empty transcript.",
            response.status,
            billableUnits,
          );
        }
        const candidate = buildCandidate({
          provider: "supadata",
          platform: "youtube",
          title:
            stringValue(data.title) ??
            stringValue(nested.title) ??
            input.title ??
            "YouTube transcript",
          url: sourceUrl,
          publishedAt:
            stringValue(data.published_at) ??
            stringValue(data.publishedAt) ??
            stringValue(nested.published_at),
          content,
          summary: stringValue(data.summary) ?? stringValue(nested.summary),
          metadata: {
            ...(youtubeVideoId(sourceUrl) ? { videoId: youtubeVideoId(sourceUrl) as string } : {}),
            ...(segments.length > 0 ? { transcriptSegments: segments } : {}),
          },
        });

        if (!candidate) {
          throw new NormalizedProviderError(
            "supadata",
            "TRANSCRIPT_EMPTY",
            "Supadata returned an empty transcript.",
            response.status,
            billableUnits,
          );
        }

        return {
          data: candidate,
          statusCode: response.status,
          billableUnits,
        };
      },
    );
  }
}

class HttpVoyageClient extends LoggedProvider implements VoyageClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.voyage,
  ) {
    super("voyage", logger);
  }

  async rerank(input: RerankInput): Promise<ProviderResult<RerankData>> {
    if (input.chunks.length === 0 || input.topK <= 0) {
      return {
        data: { results: [], totalTokens: 0 },
        usage: {
          provider: "voyage",
          operation: "rerank",
          billableUnits: 0,
          totalTokens: 0,
        },
      };
    }

    return this.call(
      { requestId: input.requestId, platform: null, operation: "rerank" },
      async () => {
        const response = await fetch(normalizeBaseUrl(this.baseUrl) + "/rerank", {
          method: "POST",
          headers: {
            authorization: "Bearer " + this.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "rerank-2.5",
            query: input.query,
            documents: input.chunks.map((chunk) => chunk.text),
            top_k: Math.min(input.chunks.length, Math.max(1, Math.trunc(input.topK))),
          }),
          signal: AbortSignal.timeout(30_000),
        });
        assertOk("voyage", response);

        const data = asRecord(await readJson(response));
        const usage = asRecord(data.usage);
        const totalTokens = numberValue(usage.total_tokens);
        if (totalTokens === null) {
          const conservativeTokens = Math.max(
            1,
            Buffer.byteLength(
              [input.query, ...input.chunks.map((chunk) => chunk.text)].join("\n"),
              "utf8",
            ),
          );
          throw new NormalizedProviderError(
            "voyage",
            "MISSING_PROVIDER_USAGE",
            "Voyage did not report token usage for a completed rerank.",
            response.status,
            conservativeTokens,
            undefined,
            undefined,
            conservativeTokens,
          );
        }
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
          data: { results, totalTokens },
          statusCode: response.status,
          billableUnits: totalTokens,
          totalTokens,
        };
      },
    );
  }
}

function modelTokenUsage(data: JsonRecord): {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} {
  const usage = asRecord(data.usage);
  const inputTokens = numberValue(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = numberValue(usage.completion_tokens ?? usage.output_tokens);
  const cachedCandidates = [
    usage.prompt_cache_hit_tokens,
    asRecord(usage.prompt_tokens_details).cached_tokens,
    asRecord(usage.input_tokens_details).cached_tokens,
  ];
  const cachedInputTokens =
    inputTokens === null
      ? null
      : (cachedCandidates
          .map(numberValue)
          .find(
            (value): value is number =>
              value !== null && Number.isInteger(value) && value >= 0 && value <= inputTokens,
          ) ?? null);
  const totalTokens =
    numberValue(usage.total_tokens) ??
    (inputTokens === null || outputTokens === null ? null : inputTokens + outputTokens);
  return {
    ...(inputTokens === null ? {} : { inputTokens }),
    ...(cachedInputTokens === null ? {} : { cachedInputTokens }),
    ...(outputTokens === null ? {} : { outputTokens }),
    ...(totalTokens === null ? {} : { totalTokens }),
  };
}

function modelContent(data: JsonRecord): string | null {
  const choice = asRecord(asArray(data.choices)[0]);
  return stringValue(asRecord(choice.message).content) ?? stringValue(choice.text);
}

function parseRoutedEffort(content: string): RoutedEffort {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned) as unknown;
  } catch {
    throw new NormalizedProviderError(
      "groq",
      "INVALID_ROUTER_OUTPUT",
      "Effort router returned invalid JSON.",
    );
  }
  const effort = stringValue(asRecord(parsed).effort);
  if (effort !== "low" && effort !== "medium" && effort !== "high" && effort !== "x_high") {
    throw new NormalizedProviderError(
      "groq",
      "INVALID_ROUTER_OUTPUT",
      "Effort router returned an unsupported effort.",
    );
  }
  return effort;
}

const defaultRouterSystemPrompt = [
  "Choose the minimum Supacontext research effort that can answer the request reliably.",
  "Allowed values are low, medium, high, and x_high.",
  'Return JSON only with this shape: {"effort":"low|medium|high|x_high"}.',
].join(" ");

class HttpDeepSeekClient extends LoggedProvider implements DeepSeekClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.deepseek,
  ) {
    super("deepseek", logger);
  }

  async research(input: DeepSeekResearchInput): Promise<ProviderResult<DeepSeekResult>> {
    return this.chat(input, input.userPrompt, "research");
  }

  async repairJson(input: DeepSeekRepairInput): Promise<ProviderResult<DeepSeekResult>> {
    const prompt = [
      "Repair the following output into valid JSON matching the requested Supacontext schema.",
      "Return JSON only.",
      "Validation error: " + input.validationError,
      "Invalid output:",
      input.invalidJson,
    ].join("\n\n");
    return this.chat(input, prompt, "repair_json");
  }

  async routeEffort(input: EffortRouterInput): Promise<ProviderResult<EffortRouterResult>> {
    const result = await this.chat(
      {
        requestId: input.requestId,
        query: input.query,
        model: DEEPSEEK_MODELS.flash,
        reasoning: "high",
        systemPrompt: input.systemPrompt ?? defaultRouterSystemPrompt,
        userPrompt: input.query,
        evidence: [],
        maxTokens: input.maxTokens,
      },
      input.query,
      "route_effort",
    );
    try {
      return {
        data: { effort: parseRoutedEffortForProvider(result.data.content, "deepseek") },
        usage: result.usage,
      };
    } catch (error) {
      throw routerOutputError("deepseek", error, null, result.usage);
    }
  }

  private async chat(
    input: DeepSeekResearchInput | DeepSeekRepairInput,
    userPrompt: string,
    operation: "research" | "repair_json" | "route_effort",
  ): Promise<ProviderResult<DeepSeekResult>> {
    return this.call({ requestId: input.requestId, platform: null, operation }, async () => {
      const response = await fetch(normalizeBaseUrl(this.baseUrl) + "/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          reasoning_effort: input.reasoning,
          thinking: { type: "enabled" },
          max_tokens: Math.max(1, Math.trunc(input.maxTokens)),
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      assertOk("deepseek", response);

      const data = asRecord(await readJson(response));
      const tokenUsage = modelTokenUsage(data);
      const content = modelContent(data);
      if (!content) {
        throw new NormalizedProviderError(
          "deepseek",
          "EMPTY_MODEL_OUTPUT",
          "DeepSeek returned empty output.",
          response.status,
          1,
          tokenUsage.inputTokens,
          tokenUsage.outputTokens,
          tokenUsage.totalTokens,
          tokenUsage.cachedInputTokens,
        );
      }
      return {
        data: { content },
        statusCode: response.status,
        billableUnits: 1,
        ...tokenUsage,
      };
    });
  }
}

function parseRoutedEffortForProvider(
  content: string,
  provider: "deepseek" | "groq",
): RoutedEffort {
  try {
    return parseRoutedEffort(content);
  } catch (error) {
    const normalized = normalizeProviderError(provider, error);
    throw new NormalizedProviderError(
      provider,
      normalized.errorCode,
      normalized.message,
      normalized.statusCode,
      normalized.billableUnits,
    );
  }
}

function routerOutputError(
  provider: "deepseek" | "groq",
  error: unknown,
  statusCode: number | null,
  usage: ProviderUsage,
): NormalizedProviderError {
  const normalized = normalizeProviderError(provider, error);
  return new NormalizedProviderError(
    provider,
    normalized.errorCode,
    normalized.message,
    statusCode ?? normalized.statusCode,
    usage.billableUnits,
    usage.inputTokens,
    usage.outputTokens,
    usage.totalTokens,
    usage.cachedInputTokens,
  );
}

class HttpGroqClient extends LoggedProvider implements GroqClient {
  constructor(
    private readonly apiKey: string,
    logger: ProviderCallLogger | undefined,
    private readonly baseUrl: string = defaultBaseUrls.groq,
  ) {
    super("groq", logger);
  }

  async routeEffort(input: EffortRouterInput): Promise<ProviderResult<EffortRouterResult>> {
    return this.call(
      { requestId: input.requestId, platform: null, operation: "route_effort" },
      async () => {
        const response = await fetch(normalizeBaseUrl(this.baseUrl) + "/chat/completions", {
          method: "POST",
          headers: {
            authorization: "Bearer " + this.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: GROQ_ROUTER_MODEL,
            messages: [
              {
                role: "system",
                content: input.systemPrompt ?? defaultRouterSystemPrompt,
              },
              { role: "user", content: input.query },
            ],
            response_format: { type: "json_object" },
            max_tokens: Math.max(1, Math.trunc(input.maxTokens)),
            temperature: 0,
            stream: false,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        assertOk("groq", response);

        const data = asRecord(await readJson(response));
        const tokenUsage = modelTokenUsage(data);
        const content = modelContent(data);
        if (!content) {
          throw new NormalizedProviderError(
            "groq",
            "EMPTY_MODEL_OUTPUT",
            "Groq returned empty router output.",
            response.status,
            1,
            tokenUsage.inputTokens,
            tokenUsage.outputTokens,
            tokenUsage.totalTokens,
            tokenUsage.cachedInputTokens,
          );
        }
        const usage: ProviderUsage = {
          provider: "groq",
          operation: "route_effort",
          billableUnits: 1,
          ...tokenUsage,
        };
        let effort: RoutedEffort;
        try {
          effort = parseRoutedEffortForProvider(content, "groq");
        } catch (error) {
          throw routerOutputError("groq", error, response.status, usage);
        }
        return {
          data: { effort },
          statusCode: response.status,
          billableUnits: 1,
          ...tokenUsage,
        };
      },
    );
  }
}

function mockCandidate(input: {
  provider: ProviderIdentifier;
  platform: ResearchPlatform;
  operation: string;
  query: string;
  index?: number;
}): NormalizedSourceCandidate {
  const index = input.index ?? 0;
  const slug = encodeURIComponent(input.operation.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  const url =
    input.platform === "reddit"
      ? "https://www.reddit.com/r/mock/comments/mock" + String(index + 1)
      : input.platform === "x"
        ? "https://x.com/mock/status/" + String(index + 1)
        : input.platform === "youtube"
          ? "https://www.youtube.com/watch?v=mock" + String(index + 1)
          : input.platform === "github"
            ? "https://github.com/mock/supacontext"
            : input.platform === "hackernews"
              ? "https://news.ycombinator.com/item?id=" + String(index + 1)
              : "https://example.com/" + input.platform + "/" + slug + "/" + String(index + 1);
  const externalId = "mock_" + String(index + 1);
  return {
    provider: input.provider,
    platform: input.platform,
    title: input.operation + " result " + String(index + 1),
    url,
    publishedAt: "2026-01-01T00:00:00.000Z",
    content: input.query + " context from " + input.platform + " using " + input.operation + ".",
    summary: input.query + " evidence",
    metadata: {
      externalId,
      ...(input.platform === "reddit" ? { threadId: externalId } : {}),
      ...(input.platform === "x" ? { postId: externalId } : {}),
      ...(input.platform === "youtube" ? { videoId: "mock" + String(index + 1) } : {}),
    },
  };
}

function mockCount(params: ProviderParams | undefined, fallback = 1): number {
  return clampInteger(params?.limit ?? params?.count ?? fallback, 1, 10);
}

function mockQuery(params: ProviderParams | undefined, fallback: string): string {
  const value = params?.query ?? params?.q ?? params?.search;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

class MockExaClient extends LoggedProvider implements ExaClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("exa", logger);
  }

  async search(input: WebSearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.call(
      { requestId: input.requestId, platform: "web", operation: "search" },
      async () => ({
        data: Array.from({ length: clampInteger(input.limit, 1, 10) }, (_, index) =>
          mockCandidate({
            provider: "exa",
            platform: "web",
            operation: "search",
            query: input.query,
            index,
          }),
        ),
        statusCode: 200,
        billableUnits: 1,
      }),
    );
  }

  async fetchContent(
    input: FetchContentInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    const candidates = input.candidates.slice(0, Math.max(0, Math.trunc(input.limit)));
    if (candidates.length === 0) {
      return {
        data: [],
        usage: { provider: "exa", operation: "fetch-content", billableUnits: 0 },
      };
    }
    return this.call(
      { requestId: input.requestId, platform: "web", operation: "fetch-content" },
      async () => ({
        data: candidates.map((candidate) => ({
          ...candidate,
          content: candidate.content + " Expanded page content.",
        })),
        statusCode: 200,
        billableUnits: candidates.length,
      }),
    );
  }
}

class MockFetchLayerClient extends LoggedProvider implements FetchLayerClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("fetchlayer", logger);
  }

  async execute(
    input: FetchLayerExecuteInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.call(
      {
        requestId: input.requestId,
        platform: input.platform,
        operation: input.platform + "." + input.operation,
      },
      async () => ({
        data: Array.from({ length: mockCount(input.params) }, (_, index) =>
          mockCandidate({
            provider: "fetchlayer",
            platform: input.platform,
            operation: input.operation,
            query: mockQuery(input.params, input.operation),
            index,
          }),
        ),
        statusCode: 200,
        billableUnits: 1,
      }),
    );
  }

  async searchReddit(input: SearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.execute({
      requestId: input.requestId,
      platform: "reddit",
      operation: "search",
      params: { query: input.query, limit: input.limit },
    });
  }

  async fetchRedditThread(
    input: RedditThreadFetchInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate>> {
    const result = await this.execute({
      requestId: input.requestId,
      platform: "reddit",
      operation: "post",
      params: { url: input.candidate.url },
    });
    return { data: result.data[0] ?? input.candidate, usage: result.usage };
  }

  async searchX(input: SearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.execute({
      requestId: input.requestId,
      platform: "x",
      operation: "search",
      params: { query: input.query, count: input.limit },
    });
  }

  async fetchXPost(input: XFetchInput): Promise<ProviderResult<NormalizedSourceCandidate>> {
    const result = await this.execute({
      requestId: input.requestId,
      platform: "x",
      operation: "tweet-detail",
      params: { url: input.candidate.url },
    });
    return { data: result.data[0] ?? input.candidate, usage: result.usage };
  }
}

class MockApiDirectClient extends LoggedProvider implements ApiDirectClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("api_direct", logger);
  }

  async execute(
    input: ApiDirectExecuteInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    const definition = apiDirectDefinitions[input.operation];
    const sanitized = sanitizeApiDirectParams(definition, input.params ?? {});
    return this.call(
      {
        requestId: input.requestId,
        platform: definition.platform,
        operation: definition.usageOperation,
      },
      async () => ({
        data: Array.from({ length: mockCount(sanitized.params) }, (_, index) =>
          mockCandidate({
            provider: "api_direct",
            platform: definition.platform,
            operation: input.operation,
            query: mockQuery(sanitized.params, input.operation),
            index,
          }),
        ),
        statusCode: 200,
        billableUnits: sanitized.billableUnits,
      }),
    );
  }
}

class MockSupadataClient extends LoggedProvider implements SupadataClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("supadata", logger);
  }

  async fetchTranscript(
    input: TranscriptFetchInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate>> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "youtube",
        operation: "youtube.transcript",
      },
      async () => {
        const videoId = youtubeVideoId(input.url);
        const segments = Array.from({ length: 4 }, (_, index) => ({
          text: (input.title ?? "Video") + " transcript segment " + String(index + 1) + ".",
          startSeconds: index * 30,
          endSeconds: index * 30 + 25,
        }));
        return {
          data: {
            provider: "supadata",
            platform: "youtube",
            title: input.title ?? "YouTube transcript",
            url: input.url,
            publishedAt: null,
            content: segments.map((segment) => segment.text).join("\n"),
            summary: "Mock YouTube transcript evidence.",
            metadata: {
              ...(videoId ? { videoId } : {}),
              transcriptSegments: segments,
            },
          },
          statusCode: 200,
          billableUnits: 1,
        };
      },
    );
  }
}

class MockHackerNewsClient extends LoggedProvider implements HackerNewsClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("hacker_news_algolia", logger);
  }

  async execute(
    input: HackerNewsExecuteInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    const provider = hackerNewsProvider(input.operation);
    return this.call(
      {
        requestId: input.requestId,
        provider,
        platform: "hackernews",
        operation: hackerNewsUsageOperation(input.operation),
      },
      async () => ({
        data: Array.from({ length: mockCount(input.params) }, (_, index) =>
          mockCandidate({
            provider,
            platform: "hackernews",
            operation: input.operation,
            query: mockQuery(input.params, "Hacker News"),
            index,
          }),
        ),
        statusCode: 200,
        // Deliberately nonzero even though both Hacker News APIs are free.
        billableUnits: 1,
      }),
    );
  }
}

class MockGitHubClient extends LoggedProvider implements GitHubClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("github", logger);
  }

  async execute(input: GitHubExecuteInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return this.call(
      {
        requestId: input.requestId,
        platform: "github",
        operation: githubUsageOperation(input.operation),
      },
      async () => ({
        data: Array.from({ length: mockCount(input.params) }, (_, index) =>
          mockCandidate({
            provider: "github",
            platform: "github",
            operation: input.operation,
            query: mockQuery(input.params, "GitHub"),
            index,
          }),
        ),
        statusCode: 200,
        billableUnits: 1,
      }),
    );
  }
}

function approximateMockTokens(...values: string[]): number {
  return Math.max(1, Math.ceil(values.join(" ").length / 4));
}

class MockVoyageClient extends LoggedProvider implements VoyageClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("voyage", logger);
  }

  async rerank(input: RerankInput): Promise<ProviderResult<RerankData>> {
    const totalTokens = approximateMockTokens(
      input.query,
      ...input.chunks.map((chunk) => chunk.text),
    );
    return this.call(
      { requestId: input.requestId, platform: null, operation: "rerank" },
      async () => ({
        data: {
          results: input.chunks.slice(0, Math.max(0, input.topK)).map((chunk, index) => ({
            id: chunk.id,
            score: 1 - index / 100,
          })),
          totalTokens,
        },
        statusCode: 200,
        billableUnits: totalTokens,
        totalTokens,
      }),
    );
  }
}

function mockEffort(query: string): RoutedEffort {
  const normalized = query.toLowerCase();
  if (/\b(exhaustive|deep|comprehensive|everything)\b/.test(normalized)) {
    return "x_high";
  }
  if (/\b(compare|investigate|research|multiple|across)\b/.test(normalized)) {
    return "high";
  }
  if (query.length > 120) {
    return "medium";
  }
  return "low";
}

class MockDeepSeekClient extends LoggedProvider implements DeepSeekClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("deepseek", logger);
  }

  async research(input: DeepSeekResearchInput): Promise<ProviderResult<DeepSeekResult>> {
    const content = JSON.stringify({
      answer: "Mock context for " + input.query + ".",
      context_pack: input.evidence.slice(0, 3).map((evidence) => ({
        claim: "Evidence from " + evidence.title + " is relevant.",
        confidence: "medium",
        supporting_sources: [evidence.sourceId],
      })),
      sources: [],
      gaps: [],
    });
    return this.mockChat(
      input.requestId,
      "research",
      input.systemPrompt + input.userPrompt,
      content,
    );
  }

  async repairJson(input: DeepSeekRepairInput): Promise<ProviderResult<DeepSeekResult>> {
    const content = JSON.stringify({
      answer: "Repaired mock context for " + input.query + ".",
      context_pack: [],
      sources: [],
      gaps: [],
    });
    return this.mockChat(input.requestId, "repair_json", input.invalidJson, content);
  }

  async routeEffort(input: EffortRouterInput): Promise<ProviderResult<EffortRouterResult>> {
    const content = JSON.stringify({ effort: mockEffort(input.query) });
    const result = await this.mockChat(input.requestId, "route_effort", input.query, content);
    return {
      data: { effort: parseRoutedEffortForProvider(result.data.content, "deepseek") },
      usage: result.usage,
    };
  }

  private async mockChat(
    requestId: string,
    operation: string,
    input: string,
    content: string,
  ): Promise<ProviderResult<DeepSeekResult>> {
    const inputTokens = approximateMockTokens(input);
    const outputTokens = approximateMockTokens(content);
    return this.call({ requestId, platform: null, operation }, async () => ({
      data: { content },
      statusCode: 200,
      billableUnits: 1,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }));
  }
}

class MockGroqClient extends LoggedProvider implements GroqClient {
  constructor(logger: ProviderCallLogger | undefined) {
    super("groq", logger);
  }

  async routeEffort(input: EffortRouterInput): Promise<ProviderResult<EffortRouterResult>> {
    const effort = mockEffort(input.query);
    const inputTokens = approximateMockTokens(input.query);
    const outputTokens = 8;
    return this.call(
      { requestId: input.requestId, platform: null, operation: "route_effort" },
      async () => ({
        data: { effort },
        statusCode: 200,
        billableUnits: 1,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      }),
    );
  }
}

export function createMockProviderClients(logger?: ProviderCallLogger): ProviderClients {
  return {
    exa: new MockExaClient(logger),
    fetchlayer: new MockFetchLayerClient(logger),
    apiDirect: new MockApiDirectClient(logger),
    supadata: new MockSupadataClient(logger),
    hackerNews: new MockHackerNewsClient(logger),
    github: new MockGitHubClient(logger),
    voyage: new MockVoyageClient(logger),
    deepseek: new MockDeepSeekClient(logger),
    groq: new MockGroqClient(logger),
  };
}

export function createProviderClients(options: CreateProviderClientOptions = {}): ProviderClients {
  const env = resolveEnv(options.env);
  const mode = options.mode ?? "auto";
  const urls = {
    ...defaultBaseUrls,
    ...options.baseUrls,
    fetchlayer: options.baseUrls?.fetchlayer ?? env.fetchLayerBaseUrl ?? defaultBaseUrls.fetchlayer,
  };
  const choose = <T>(
    provider: ProviderIdentifier,
    key: string | undefined,
    real: (configuredKey: string) => T,
    mock: () => T,
  ): T => {
    if (mode === "mock") {
      return mock();
    }
    if (mode === "real") {
      return real(assertRealKey(provider, key));
    }
    return isMissingKey(key) ? mock() : real((key as string).trim());
  };

  return {
    exa: choose<ExaClient>(
      "exa",
      env.exaApiKey,
      (key) => new HttpExaClient(key, options.logger, urls.exa),
      () => new MockExaClient(options.logger),
    ),
    fetchlayer: choose<FetchLayerClient>(
      "fetchlayer",
      env.fetchLayerApiKey,
      (key) => new HttpFetchLayerClient(key, options.logger, urls.fetchlayer),
      () => new MockFetchLayerClient(options.logger),
    ),
    apiDirect: choose<ApiDirectClient>(
      "api_direct",
      env.apiDirectApiKey,
      (key) => new HttpApiDirectClient(key, options.logger, urls.apiDirect),
      () => new MockApiDirectClient(options.logger),
    ),
    supadata: choose<SupadataClient>(
      "supadata",
      env.supadataApiKey,
      (key) => new HttpSupadataClient(key, options.logger, urls.supadata),
      () => new MockSupadataClient(options.logger),
    ),
    hackerNews:
      mode === "mock"
        ? new MockHackerNewsClient(options.logger)
        : new HttpHackerNewsClient(options.logger, urls.hackerNewsAlgolia, urls.hackerNewsFirebase),
    github: choose<GitHubClient>(
      "github",
      env.githubPat,
      (key) => new HttpGitHubClient(key, options.logger, urls.github),
      () => new MockGitHubClient(options.logger),
    ),
    voyage: choose<VoyageClient>(
      "voyage",
      env.voyageApiKey,
      (key) => new HttpVoyageClient(key, options.logger, urls.voyage),
      () => new MockVoyageClient(options.logger),
    ),
    deepseek: choose<DeepSeekClient>(
      "deepseek",
      env.deepseekApiKey,
      (key) => new HttpDeepSeekClient(key, options.logger, urls.deepseek),
      () => new MockDeepSeekClient(options.logger),
    ),
    groq: choose<GroqClient>(
      "groq",
      env.groqApiKey,
      (key) => new HttpGroqClient(key, options.logger, urls.groq),
      () => new MockGroqClient(options.logger),
    ),
  };
}
