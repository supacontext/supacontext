import {
  calculateModelUpstreamUsdNanos,
  calculateToolUpstreamUsdNanos,
  priceModelTokensMicrocredits,
  priceToolOperationMicrocredits,
  type ModelId,
  type Platform,
  type ProviderName,
  type ToolOperation,
} from "@supacontext/core";
import type { WorkerStore } from "./store.js";

export type CostAuthorization = {
  id: string;
  provider: ProviderName;
  platform: Platform | null;
  operation: string;
  reservedMicrocredits: bigint;
};

export class BudgetExhaustedError extends Error {
  constructor(message = "The remaining request budget cannot fund another safe operation.") {
    super(message);
    this.name = "BudgetExhaustedError";
  }
}

export class ResearchBudget {
  private sequence = 0;
  private committed: bigint;
  private executionLimit: bigint;

  constructor(
    readonly requestId: string,
    readonly claimAttempt: number,
    readonly reservationLimit: bigint,
    committedMicrocredits: bigint,
    private readonly store: WorkerStore,
  ) {
    if (reservationLimit <= 0n || committedMicrocredits < 0n) {
      throw new Error("Research budget values are invalid.");
    }

    this.executionLimit = reservationLimit;
    this.committed = committedMicrocredits;
  }

  get spent(): bigint {
    return this.committed;
  }

  get limit(): bigint {
    return this.executionLimit;
  }

  get remaining(): bigint {
    return this.executionLimit > this.committed ? this.executionLimit - this.committed : 0n;
  }

  narrowLimit(limit: bigint): void {
    if (limit <= 0n) {
      throw new Error("Execution credit limit must be positive.");
    }

    this.executionLimit = limit < this.reservationLimit ? limit : this.reservationLimit;
  }

  async authorizeTool(input: {
    operation: ToolOperation;
    provider: ProviderName;
    platform: Platform | null;
    maximumUnits?: bigint;
  }): Promise<CostAuthorization | null> {
    const units = input.maximumUnits ?? 1n;
    const reservedMicrocredits = priceToolOperationMicrocredits(input.operation, units);
    const upstreamCostUsdNanos = calculateToolUpstreamUsdNanos(input.operation, units);

    return this.authorize({
      provider: input.provider,
      platform: input.platform,
      operation: input.operation,
      reservedMicrocredits,
      upstreamCostUsdNanos,
      billableUnits: units,
    });
  }

  async authorizeModel(input: {
    provider: "deepseek" | "groq";
    model: ModelId;
    platform?: Platform | null;
    maximumInputTokens: number;
    maximumOutputTokens: number;
    operation: string;
  }): Promise<CostAuthorization | null> {
    const inputTokens = BigInt(input.maximumInputTokens);
    const outputTokens = BigInt(input.maximumOutputTokens);
    const reservedMicrocredits = priceModelTokensMicrocredits(
      input.model,
      inputTokens,
      outputTokens,
    );
    const upstream = calculateModelUpstreamUsdNanos(input.model, inputTokens, outputTokens);

    return this.authorize({
      provider: input.provider,
      platform: input.platform ?? null,
      operation: input.operation,
      reservedMicrocredits,
      upstreamCostUsdNanos: upstream.totalUsdNanos,
      inputTokens: input.maximumInputTokens,
      outputTokens: input.maximumOutputTokens,
      model: input.model,
    });
  }

  async settleTool(
    authorization: CostAuthorization,
    operation: ToolOperation,
    billableUnits: number,
  ): Promise<void> {
    const units = BigInt(billableUnits);
    const actualMicrocredits = priceToolOperationMicrocredits(operation, units);
    const upstreamCostUsdNanos = calculateToolUpstreamUsdNanos(operation, units);

    await this.settle(authorization, {
      actualMicrocredits,
      upstreamCostUsdNanos,
      billableUnits: units,
    });
  }

  async settleModel(
    authorization: CostAuthorization,
    model: ModelId,
    inputTokens: number | undefined,
    outputTokens: number | undefined,
    cachedInputTokens?: number,
  ): Promise<void> {
    if (inputTokens === undefined || outputTokens === undefined) {
      await this.store.markCostEventUncertain(authorization.id, this.requestId);
      return;
    }

    const input = BigInt(inputTokens);
    const output = BigInt(outputTokens);
    const cachedInput = cachedInputTokens === undefined ? undefined : BigInt(cachedInputTokens);
    const actualMicrocredits = priceModelTokensMicrocredits(model, input, output, cachedInput);
    const upstream = calculateModelUpstreamUsdNanos(model, input, output, cachedInput);

    await this.settle(authorization, {
      actualMicrocredits,
      upstreamCostUsdNanos: upstream.totalUsdNanos,
      inputTokens,
      ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
      outputTokens,
    });
  }

  async release(authorization: CostAuthorization): Promise<void> {
    await this.store.releaseCostEvent(authorization.id, this.requestId);
    this.committed -= authorization.reservedMicrocredits;
  }

  async markUncertain(_authorization: CostAuthorization): Promise<void> {
    await this.store.markCostEventUncertain(_authorization.id, this.requestId);
  }

  private async authorize(input: {
    provider: ProviderName;
    platform: Platform | null;
    operation: string;
    reservedMicrocredits: bigint;
    upstreamCostUsdNanos: bigint;
    billableUnits?: bigint;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  }): Promise<CostAuthorization | null> {
    if (input.reservedMicrocredits <= 0n || input.reservedMicrocredits > this.remaining) {
      return null;
    }

    this.sequence += 1;
    const id = `${this.requestId}:${this.claimAttempt}:${this.sequence}`;
    const created = await this.store.beginCostEvent({
      id,
      requestId: this.requestId,
      ...input,
    });

    if (!created) {
      return null;
    }

    this.committed += input.reservedMicrocredits;

    return {
      id,
      provider: input.provider,
      platform: input.platform,
      operation: input.operation,
      reservedMicrocredits: input.reservedMicrocredits,
    };
  }

  private async settle(
    authorization: CostAuthorization,
    actual: {
      actualMicrocredits: bigint;
      upstreamCostUsdNanos: bigint;
      billableUnits?: bigint;
      inputTokens?: number;
      outputTokens?: number;
    },
  ): Promise<void> {
    if (actual.actualMicrocredits > authorization.reservedMicrocredits) {
      await this.markUncertain(authorization);
      throw new Error("Provider usage exceeded its preauthorized request budget.");
    }

    await this.store.settleCostEvent({
      id: authorization.id,
      requestId: this.requestId,
      ...actual,
    });
    this.committed -= authorization.reservedMicrocredits - actual.actualMicrocredits;
  }
}

export function estimateMaximumInputTokens(...values: string[]): number {
  const bytes = values.reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);

  return bytes + 1_024;
}

export function affordableOutputTokens(input: {
  model: ModelId;
  maximumInputTokens: number;
  desiredOutputTokens: number;
  remainingMicrocredits: bigint;
}): number {
  let low = 0;
  let high = input.desiredOutputTokens;

  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    const cost = priceModelTokensMicrocredits(
      input.model,
      BigInt(input.maximumInputTokens),
      BigInt(candidate),
    );

    if (cost <= input.remainingMicrocredits) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }

  return low;
}
