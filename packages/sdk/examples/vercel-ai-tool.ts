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
      effort: {
        type: "string",
        enum: ["low", "medium", "high", "x_high", "auto"],
        description: "Research effort. Auto chooses the least expensive suitable level.",
      },
      max_credits: {
        type: "number",
        description: "Optional per-request credit cap.",
      },
      platforms: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "web",
            "reddit",
            "x",
            "youtube",
            "facebook",
            "news",
            "forums",
            "places",
            "linkedin",
            "hackernews",
            "github",
          ],
        },
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  execute: async (input: {
    query: string;
    effort?: "low" | "medium" | "high" | "x_high" | "auto";
    max_credits?: number;
    platforms?: Array<
      | "web"
      | "reddit"
      | "x"
      | "youtube"
      | "facebook"
      | "news"
      | "forums"
      | "places"
      | "linkedin"
      | "hackernews"
      | "github"
    >;
  }) => getSupaContext().context.create(input),
};
