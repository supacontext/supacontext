import {
  CONTEXT_DEPTHS,
  getDepthCreditCost,
  isDepthAllowedForPlan,
  type ContextDepth,
  type PlanSlug,
} from "@supacontext/core";

export type UsageAuthorizationInput = {
  plan: PlanSlug;
  depth: ContextDepth;
  balance: number;
  apiKeyMaxDepth?: ContextDepth;
  monthlyCreditLimit?: number | null;
  monthToDateCredits?: number;
};

export type UsageAuthorizationResult =
  | {
      allowed: true;
      requiredCredits: number;
    }
  | {
      allowed: false;
      requiredCredits: number;
      reason: "plan_depth_restricted" | "api_key_depth_restricted" | "monthly_limit" | "credits";
    };

const depthRank = Object.fromEntries(
  CONTEXT_DEPTHS.map((depth, index) => [depth, index]),
) as Record<ContextDepth, number>;

export function getDepthRank(depth: ContextDepth): number {
  const rank = depthRank[depth];

  if (rank === undefined) {
    throw new Error(`Unknown context depth: ${depth}`);
  }

  return rank;
}

export function authorizeUsage(input: UsageAuthorizationInput): UsageAuthorizationResult {
  const requiredCredits = getDepthCreditCost(input.depth);

  if (!isDepthAllowedForPlan(input.plan, input.depth)) {
    return {
      allowed: false,
      requiredCredits,
      reason: "plan_depth_restricted",
    };
  }

  if (input.apiKeyMaxDepth && getDepthRank(input.depth) > getDepthRank(input.apiKeyMaxDepth)) {
    return {
      allowed: false,
      requiredCredits,
      reason: "api_key_depth_restricted",
    };
  }

  if (
    input.monthlyCreditLimit !== undefined &&
    input.monthlyCreditLimit !== null &&
    (input.monthToDateCredits ?? 0) + requiredCredits > input.monthlyCreditLimit
  ) {
    return {
      allowed: false,
      requiredCredits,
      reason: "monthly_limit",
    };
  }

  if (input.balance < requiredCredits) {
    return {
      allowed: false,
      requiredCredits,
      reason: "credits",
    };
  }

  return {
    allowed: true,
    requiredCredits,
  };
}
