import { z } from "zod";
import { CONTEXT_DEPTHS, PLATFORMS } from "./types.js";

export const contextRequestInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    depth: z.enum(CONTEXT_DEPTHS).default("standard"),
    sources: z.array(z.enum(PLATFORMS)).min(1).max(PLATFORMS.length).default(["web"]),
  })
  .strict();

export type ContextRequestInput = z.infer<typeof contextRequestInputSchema>;

