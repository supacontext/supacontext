import type { ContextEffort, Platform } from "@supacontext/core";

export * from "./platform-skills.js";

export type AgentCitation = {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  publishedAt?: string;
};

export type AgentContextSection = {
  title: string;
  content: string;
  citationIds: string[];
};

export type CompiledAgentContext = {
  query: string;
  effort: ContextEffort;
  sources: Platform[];
  sections: AgentContextSection[];
  citations: AgentCitation[];
  generatedAt: string;
};

export type AgentJobInput = {
  requestId: string;
  workspaceId: string;
  query: string;
  effort: ContextEffort;
  sources: Platform[];
};

export type AgentJobResult = {
  requestId: string;
  context: CompiledAgentContext;
  creditsSpent: number;
};
