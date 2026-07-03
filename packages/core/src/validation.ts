import { z } from "zod";
import { CONTEXT_DEPTHS, PLATFORMS } from "./types.js";

const platformsSchema = z
  .array(z.enum(PLATFORMS))
  .min(1)
  .max(PLATFORMS.length)
  .refine((platforms) => new Set(platforms).size === platforms.length, {
    message: "platforms must not contain duplicates",
  });

export const contextRequestInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    depth: z.enum(CONTEXT_DEPTHS).default("standard"),
    platforms: platformsSchema.optional(),
    async: z.boolean().default(false),
    webhook_url: z.string().trim().url().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ContextRequestInput = z.infer<typeof contextRequestInputSchema>;
