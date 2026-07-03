import type { ContextDepth } from "@supacontext/core";

export type ResearchAction =
  | "web_search"
  | "web_fetch"
  | "reddit_search"
  | "reddit_fetch_thread"
  | "x_search"
  | "x_fetch"
  | "youtube_transcript_fetch"
  | "rerank_pass"
  | "agent_synthesis";

export const RESEARCH_UNIT_BUDGET = {
  fast: 16,
  standard: 36,
  thorough: 80,
  deep: 140,
} as const satisfies Record<ContextDepth, number>;

export const RESEARCH_UNIT_COST = {
  web_search: 3,
  web_fetch: 2,
  reddit_search: 3,
  reddit_fetch_thread: 3,
  x_search: 3,
  x_fetch: 2,
  youtube_transcript_fetch: 4,
  rerank_pass: 4,
  agent_synthesis: 5,
} as const satisfies Record<ResearchAction, number>;

export type ResearchBudgetSnapshot = {
  limit: number;
  spent: number;
  remaining: number;
  exhausted: boolean;
};

export class ResearchBudget {
  private spentUnits = 0;

  constructor(readonly depth: ContextDepth) {}

  get limit(): number {
    return RESEARCH_UNIT_BUDGET[this.depth];
  }

  get spent(): number {
    return this.spentUnits;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.spentUnits);
  }

  canSpend(action: ResearchAction, reserve = 0): boolean {
    return this.spentUnits + RESEARCH_UNIT_COST[action] + reserve <= this.limit;
  }

  trySpend(action: ResearchAction, reserve = 0): boolean {
    if (!this.canSpend(action, reserve)) {
      return false;
    }

    this.spentUnits += RESEARCH_UNIT_COST[action];

    return true;
  }

  snapshot(): ResearchBudgetSnapshot {
    return {
      limit: this.limit,
      spent: this.spentUnits,
      remaining: this.remaining,
      exhausted: this.remaining === 0,
    };
  }
}
