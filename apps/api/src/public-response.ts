import {
  creditMicrocreditsToDisplayNumber,
  type ContextEffort,
  type Platform,
  type PublicContextResponse,
  type PublicContextUsage,
  type RequestStatus,
  type ResolvedEffort,
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
  effort: ContextEffort;
  resolved_effort: ResolvedEffort | null;
  max_resolved_effort: ResolvedEffort;
  platforms: Platform[];
  status: RequestStatus;
  effective_cap_microcredits: bigint;
  reserved_microcredits: bigint;
  spent_microcredits: bigint;
  error_code: string | null;
  error_message: string | null;
  result: StoredContextResultPayload | null;
};

function emptyUsage(request: StoredContextRequest): PublicContextUsage {
  return {
    credits_charged: creditMicrocreditsToDisplayNumber(request.spent_microcredits),
    credits_reserved: creditMicrocreditsToDisplayNumber(request.reserved_microcredits),
    effort: request.effort,
    ...(request.resolved_effort ? { resolved_effort: request.resolved_effort } : {}),
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

  if (request.error_code === "budget_exhausted") {
    return ["The remaining request budget could not fund another safe research step."];
  }

  return ["The context request failed. Retry with the same idempotency key to inspect its result."];
}

export function toPublicContextResponse(request: StoredContextRequest): PublicContextResponse {
  const result = request.result;
  const usage = result?.usage ?? emptyUsage(request);

  return {
    id: request.id,
    query: request.query,
    effort: request.effort,
    ...(request.resolved_effort ? { resolved_effort: request.resolved_effort } : {}),
    status: request.status,
    answer: result?.answer ?? null,
    context_pack: result?.context_pack ?? [],
    sources: result?.sources ?? [],
    gaps: result?.gaps ?? safeFailureGap(request),
    usage: {
      ...usage,
      credits_charged: creditMicrocreditsToDisplayNumber(request.spent_microcredits),
      credits_reserved: creditMicrocreditsToDisplayNumber(request.reserved_microcredits),
      effort: request.effort,
      ...(request.resolved_effort ? { resolved_effort: request.resolved_effort } : {}),
    },
  };
}
