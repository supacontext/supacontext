import { createSupaContext } from "@supacontext/sdk";

function getSupaContext() {
  if (!process.env.SUPACONTEXT_API_KEY) {
    throw new Error("Set SUPACONTEXT_API_KEY before using the Supacontext tool.");
  }

  return createSupaContext({
    apiKey: process.env.SUPACONTEXT_API_KEY,
    baseUrl: process.env.SUPACONTEXT_API_URL,
  });
}

export const supacontextTool = {
  description: "Get compact, cited public context for an agent.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The research question or context request.",
      },
      depth: {
        type: "string",
        enum: ["fast", "standard", "thorough", "deep"],
      },
      platforms: {
        type: "array",
        items: {
          type: "string",
          enum: ["web", "reddit", "x", "youtube"],
        },
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  execute: async (input: {
    query: string;
    depth?: "fast" | "standard" | "thorough" | "deep";
    platforms?: Array<"web" | "reddit" | "x" | "youtube">;
  }) => getSupaContext().context.create(input),
};
