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

function safeFailureGap(request: StoredContextRequest): string[] {
  if (request.status !== "failed" || !request.error_code) {
    return [];
  }

  if (request.error_code === "internal_error") {
    return ["The context request could not be queued. Please retry."];
  }

  return ["The context request failed. Please retry."];
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
    gaps: result?.gaps ?? safeFailureGap(request),
    usage: result?.usage ?? emptyUsage(request),
  };
}
