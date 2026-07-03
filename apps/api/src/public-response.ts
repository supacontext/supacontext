import type {
  ContextDepth,
  Platform,
  PublicContextResponse,
  PublicContextUsage,
  RequestStatus,
} from "@supacontext/core";

export type StoredContextResultPayload = {
  answer: string | null;
  context_pack: unknown[];
  sources: unknown[];
  gaps: unknown[];
  usage: PublicContextUsage;
};

export type StoredContextRequest = {
  id: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  status: RequestStatus;
  spent_credits: number;
  error_code: string | null;
  error_message: string | null;
  result: StoredContextResultPayload | null;
};

function emptyUsage(request: StoredContextRequest): PublicContextUsage {
  return {
    credits_charged: request.spent_credits,
    depth: request.depth,
    platforms_used: request.platforms,
    sources_considered: 0,
    sources_used: 0,
    cached: false,
  };
}

export function toPublicContextResponse(request: StoredContextRequest): PublicContextResponse {
  const result = request.result;

  return {
    id: request.id,
    query: request.query,
    depth: request.depth,
    status: request.status,
    answer: result?.answer ?? null,
    context_pack: result?.context_pack ?? [],
    sources: result?.sources ?? [],
    gaps: result?.gaps ?? (request.error_message ? [request.error_message] : []),
    usage: result?.usage ?? emptyUsage(request),
  };
}

export function createPlaceholderResult(input: {
  id: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  creditsCharged: number;
}): StoredContextResultPayload {
  const sources = input.platforms.map((platform, index) => ({
    id: `src_${index + 1}`,
    title: `${platform} placeholder source`,
    url: `https://example.com/supacontext/${platform}`,
    platform,
  }));

  return {
    answer: `Placeholder context for "${input.query}". Provider-backed retrieval is not enabled yet.`,
    context_pack: [
      {
        id: "pack_1",
        title: "Request lifecycle placeholder",
        summary:
          "The request was authenticated, authorized, charged, recorded, and completed with a stable mock result.",
        source_ids: sources.map((source) => source.id),
      },
    ],
    sources,
    gaps: ["Provider-backed retrieval and synthesis are not enabled in this API service yet."],
    usage: {
      credits_charged: input.creditsCharged,
      depth: input.depth,
      platforms_used: input.platforms,
      sources_considered: sources.length,
      sources_used: sources.length,
      cached: false,
    },
  };
}
