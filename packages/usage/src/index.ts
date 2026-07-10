import {
  EFFORT_PROFILES,
  RESOLVED_EFFORTS,
  type ContextEffort,
  type ResolvedEffort,
} from "@supacontext/core";

export type UsageAuthorizationInput = {
  effort: ContextEffort;
  balanceCreditMicros: bigint;
  callerMaxCreditMicros?: bigint | null;
  apiKeyMaxEffort?: ResolvedEffort;
  monthlyCreditLimitMicros?: bigint | null;
  monthToDateCreditMicros?: bigint;
};

export type UsageDenialReason =
  "api_key_effort_restricted" | "caller_cap" | "monthly_limit" | "credits";

export type UsageAuthorizationResult =
  | {
      allowed: true;
      reservationCreditMicros: bigint;
      minimumCreditMicros: bigint;
      effortCapCreditMicros: bigint;
    }
  | {
      allowed: false;
      reason: UsageDenialReason;
      effectiveReservationCreditMicros: bigint;
      minimumCreditMicros: bigint;
      effortCapCreditMicros: bigint;
    };

const effortRank = Object.fromEntries(
  RESOLVED_EFFORTS.map((effort, index) => [effort, index]),
) as Record<ResolvedEffort, number>;

export function getEffortRank(effort: ResolvedEffort): number {
  const rank = effortRank[effort];

  if (rank === undefined) {
    throw new Error(`Unknown resolved effort: ${effort}`);
  }

  return rank;
}

function assertCreditMicros(value: bigint, name: string): void {
  if (typeof value !== "bigint" || value < 0n) {
    throw new Error(`${name} must be a non-negative bigint in credit microcredits.`);
  }
}

function optionalCreditMicros(value: bigint | null | undefined, name: string): bigint | null {
  if (value === undefined || value === null) {
    return null;
  }

  assertCreditMicros(value, name);
  return value;
}

function effortCapForApiKey(input: UsageAuthorizationInput): bigint {
  const requestedCap = EFFORT_PROFILES[input.effort].maximumCreditMicros;

  if (input.effort !== "auto" || !input.apiKeyMaxEffort) {
    return requestedCap;
  }

  const apiKeyCap = EFFORT_PROFILES[input.apiKeyMaxEffort].maximumCreditMicros;
  return requestedCap < apiKeyCap ? requestedCap : apiKeyCap;
}

export function authorizeUsage(input: UsageAuthorizationInput): UsageAuthorizationResult {
  assertCreditMicros(input.balanceCreditMicros, "Credit balance");
  const callerMax = optionalCreditMicros(input.callerMaxCreditMicros, "Caller credit cap");
  const monthlyLimit = optionalCreditMicros(input.monthlyCreditLimitMicros, "Monthly credit limit");
  const monthToDate = input.monthToDateCreditMicros ?? 0n;
  assertCreditMicros(monthToDate, "Month-to-date credits");

  const profile = EFFORT_PROFILES[input.effort];
  const minimumCreditMicros = profile.minimumCreditMicros;
  const effortCapCreditMicros = effortCapForApiKey(input);

  if (
    input.effort !== "auto" &&
    input.apiKeyMaxEffort &&
    getEffortRank(input.effort) > getEffortRank(input.apiKeyMaxEffort)
  ) {
    return {
      allowed: false,
      reason: "api_key_effort_restricted",
      effectiveReservationCreditMicros: 0n,
      minimumCreditMicros,
      effortCapCreditMicros,
    };
  }

  const monthlyRemaining =
    monthlyLimit === null ? null : monthlyLimit > monthToDate ? monthlyLimit - monthToDate : 0n;
  const caps: Array<{
    value: bigint;
    reason: Exclude<UsageDenialReason, "api_key_effort_restricted"> | null;
  }> = [
    { value: effortCapCreditMicros, reason: null },
    ...(callerMax === null ? [] : [{ value: callerMax, reason: "caller_cap" as const }]),
    ...(monthlyRemaining === null
      ? []
      : [{ value: monthlyRemaining, reason: "monthly_limit" as const }]),
    { value: input.balanceCreditMicros, reason: "credits" },
  ];
  const limitingCap = caps.reduce((lowest, candidate) =>
    candidate.value < lowest.value ? candidate : lowest,
  );

  if (limitingCap.value < minimumCreditMicros) {
    return {
      allowed: false,
      reason: limitingCap.reason ?? "credits",
      effectiveReservationCreditMicros: limitingCap.value,
      minimumCreditMicros,
      effortCapCreditMicros,
    };
  }

  return {
    allowed: true,
    reservationCreditMicros: limitingCap.value,
    minimumCreditMicros,
    effortCapCreditMicros,
  };
}
