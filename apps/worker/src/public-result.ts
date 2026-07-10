import {
  CONTEXT_EFFORTS,
  PLATFORMS,
  RESOLVED_EFFORTS,
  type ContextEffort,
  type Platform,
  type ResolvedEffort,
} from "@supacontext/core";
import { z } from "zod";

const confidenceSchema = z.enum(["low", "medium", "high"]);

export const publicContextResultSchema = z
  .object({
    answer: z.string().min(1).max(8_000),
    context_pack: z
      .array(
        z
          .object({
            claim: z.string().min(1).max(1_200),
            confidence: confidenceSchema,
            supporting_sources: z.array(z.string().min(1)).min(1).max(12),
          })
          .strict(),
      )
      .max(24),
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(/^src_[a-z0-9_]+$/),
            platform: z.enum(PLATFORMS),
            title: z.string().min(1).max(300),
            url: z.string().url(),
            published_at: z.string().datetime().nullable(),
            summary: z.string().min(1).max(700),
          })
          .strict(),
      )
      .max(40),
    gaps: z.array(z.string().min(1).max(500)).max(20),
    usage: z
      .object({
        credits_charged: z.number().nonnegative(),
        credits_reserved: z.number().nonnegative(),
        effort: z.enum(CONTEXT_EFFORTS),
        resolved_effort: z.enum(RESOLVED_EFFORTS),
        platforms_used: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length),
        sources_considered: z.number().int().nonnegative(),
        sources_used: z.number().int().nonnegative(),
        cached: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    const sourceIds = new Set(result.sources.map((source) => source.id));

    for (const [index, item] of result.context_pack.entries()) {
      for (const sourceId of item.supporting_sources) {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: "custom",
            path: ["context_pack", index, "supporting_sources"],
            message: `Unknown supporting source id: ${sourceId}`,
          });
        }
      }
    }

    if (result.usage.sources_used !== result.sources.length) {
      context.addIssue({
        code: "custom",
        path: ["usage", "sources_used"],
        message: "sources_used must match the number of public sources.",
      });
    }
  });

export type PublicContextResult = z.infer<typeof publicContextResultSchema>;
export type ContextPackItem = PublicContextResult["context_pack"][number];
export type PublicSource = PublicContextResult["sources"][number];

export type ResultUsageInput = {
  creditsCharged: number;
  creditsReserved?: number;
  effort: ContextEffort;
  resolvedEffort: ResolvedEffort;
  platformsUsed: Platform[];
  sourcesConsidered: number;
  sourcesUsed: number;
  cached?: boolean;
};

export function cleanPublicText(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value : "";
  const cleaned = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3).trim()}...` : cleaned;
}

export function buildUsage(input: ResultUsageInput): PublicContextResult["usage"] {
  return {
    credits_charged: input.creditsCharged,
    credits_reserved: input.creditsReserved ?? 0,
    effort: input.effort,
    resolved_effort: input.resolvedEffort,
    platforms_used: input.platformsUsed,
    sources_considered: input.sourcesConsidered,
    sources_used: input.sourcesUsed,
    cached: input.cached ?? false,
  };
}

export function validatePublicResult(value: unknown): PublicContextResult {
  return publicContextResultSchema.parse(value);
}
