import { z } from "zod";
import { CONTEXT_DEPTHS, PLATFORMS } from "./types.js";

const maxMetadataEntries = 50;
const maxMetadataValueSize = 4096;

const platformsSchema = z
  .array(z.enum(PLATFORMS))
  .min(1)
  .max(PLATFORMS.length)
  .refine((platforms) => new Set(platforms).size === platforms.length, {
    message: "platforms must not contain duplicates",
  });

const metadataSchema = z
  .record(z.string().max(100), z.unknown())
  .refine((metadata) => Object.keys(metadata).length <= maxMetadataEntries, {
    message: `metadata must not contain more than ${maxMetadataEntries} entries`,
  })
  .refine(
    (metadata) =>
      Object.values(metadata).every((value) => {
        try {
          const serialized = JSON.stringify(value);

          return serialized !== undefined && serialized.length <= maxMetadataValueSize;
        } catch {
          return false;
        }
      }),
    {
      message: `metadata values must not exceed ${maxMetadataValueSize} characters`,
    },
  );

export const contextRequestInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    depth: z.enum(CONTEXT_DEPTHS).default("standard"),
    platforms: platformsSchema.optional(),
    async: z.boolean().default(false),
    webhook_url: z.string().trim().pipe(z.url()).optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export type ContextRequestInput = z.infer<typeof contextRequestInputSchema>;
