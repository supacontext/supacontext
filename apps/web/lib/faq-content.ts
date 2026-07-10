export type FAQ = {
  question: string;
  answer: string;
  shortAnswer?: string;
  showOnHomepage?: boolean;
};

export const faqs: FAQ[] = [
  {
    question: "What is an AI agent context API?",
    shortAnswer:
      "It gives agents fresh external context before they act, returned as compact cited JSON.",
    answer:
      "An AI agent context API gives agents current external context before they act. Supacontext accepts a query and returns compact, cited JSON from public sources so your agent can answer, plan, or write with evidence instead of stale model memory.",
    showOnHomepage: true,
  },
  {
    question: "How is Supacontext different from a search API or scraper?",
    shortAnswer:
      "Search APIs return links. Scrapers return raw pages. Supacontext returns structured context agents can use directly.",
    answer:
      "Search APIs return links and snippets. Scrapers return raw pages. Supacontext turns public web, social, news, forum, video, map, Hacker News, and GitHub signals into structured context packs with citations, gaps, and usage metadata that agents can consume directly.",
    showOnHomepage: true,
  },
  {
    question: "Can Supacontext replace separate platform integrations?",
    shortAnswer:
      "Yes. Use one endpoint instead of maintaining separate source connectors for every agent workflow.",
    answer:
      "Yes. Use one endpoint instead of wiring separate search, social, community, and video providers. You can let Supacontext choose sources or pass a platform list when an agent needs a specific channel.",
    showOnHomepage: true,
  },
  {
    question: "What does Supacontext return?",
    shortAnswer:
      "A JSON response with an answer, context pack, citations, gaps, and usage metadata.",
    answer:
      "The response is JSON with an answer, context_pack, sources, gaps, and usage fields. Sources carry citations so your application can show where evidence came from and detect when a question needs more research.",
    showOnHomepage: true,
  },
  {
    question: "Is Supacontext useful for RAG and agentic research?",
    answer:
      "Yes. RAG pipelines need fresh retrieval before generation, and agents need compact evidence before tool calls. Supacontext gives both workflows current public context without forcing your team to maintain every connector.",
  },
  {
    question: "Which effort should I choose?",
    answer:
      "Use Low for focused lookups, Medium for routine multi-source context, High for broad cross-checking, and X High for exhaustive research. Auto routes each query to the least expensive suitable effort.",
  },
  {
    question: "Does Supacontext help reduce token usage?",
    answer:
      "Yes. Agents receive a compact context pack instead of full pages, threads, transcripts, and raw provider payloads. That keeps prompts smaller while preserving the cited evidence needed for reliable answers.",
  },
  {
    question: "Can I use Supacontext with Claude, Codex, Vercel AI SDK, LangChain, or MCP?",
    answer:
      "Yes. Supacontext works through the API, JavaScript SDK, MCP server, CLI, and agent setup skill, so you can add cited public context to most agent stacks without changing your model provider.",
  },
  {
    question: "Is Supacontext safe to call from a browser?",
    answer:
      "No. Keep Supacontext API keys on the server. Browser and mobile clients should call your backend, and your backend should call Supacontext with a server-side key.",
  },
  {
    question: "How does Supacontext pricing work?",
    answer:
      "Supacontext reserves credits before paid work, charges actual provider operations and model token usage, then releases anything unused. Every effort has an internal cap, and max_credits can set a lower cap per request.",
  },
];

export const homepageFaqs = faqs.filter((faq) => faq.showOnHomepage);
