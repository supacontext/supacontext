import {
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

const depthRank: Record<ContextDepth, number> = {
  fast: 0,
  standard: 1,
  thorough: 2,
  deep: 3,
};

function getDepthRank(depth: ContextDepth): number {
  return depthRank[depth] ?? 0;
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
