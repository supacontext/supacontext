import { PLATFORMS, type Platform, type ProviderName } from "@supacontext/core";

export const AGENT_PLATFORMS = PLATFORMS;
export type AgentPlatform = Platform;
export type PlatformSelectionMode = "auto" | "manual";
export type PlatformLoaderName = `get_${AgentPlatform}_tools`;

export type PlatformOperationProvider = Extract<
  ProviderName,
  | "exa"
  | "fetchlayer"
  | "api_direct"
  | "supadata"
  | "hacker_news_firebase"
  | "hacker_news_algolia"
  | "github"
>;

export type PlatformOperation = {
  readonly name: string;
  readonly provider: PlatformOperationProvider;
  readonly whenToUse: string;
};

export type PlatformSkill = {
  readonly platform: AgentPlatform;
  readonly loader: PlatformLoaderName;
  readonly whenToUse: string;
  readonly operations: readonly PlatformOperation[];
};

export type PlatformDiscoveryTool = {
  readonly name: PlatformLoaderName;
  readonly platform: AgentPlatform;
  readonly description: string;
};

type PlatformSkillDefinition = Omit<PlatformSkill, "platform" | "loader">;

function operation(
  name: string,
  provider: PlatformOperationProvider,
  whenToUse: string,
): PlatformOperation {
  return { name, provider, whenToUse };
}

const skillDefinitions = {
  web: {
    whenToUse:
      "Use web for broad public-web discovery, primary sources, or fetching readable content from a known URL.",
    operations: [
      operation("search", "exa", "Find relevant public web pages for a topic or question."),
      operation(
        "fetch-content",
        "exa",
        "Retrieve page content after search, or when the query supplies a useful public URL.",
      ),
    ],
  },
  reddit: {
    whenToUse:
      "Use Reddit for community discussions, subreddit activity, posts, comments, and public user history.",
    operations: [
      operation("search", "fetchlayer", "Search Reddit posts by query."),
      operation("search-comments", "fetchlayer", "Search Reddit comments by query."),
      operation("post", "fetchlayer", "Fetch a specific Reddit post and its discussion context."),
      operation("community-posts", "fetchlayer", "List posts from a known subreddit."),
      operation("community-details", "fetchlayer", "Inspect a subreddit's public details."),
      operation("user-profile", "fetchlayer", "Inspect a known Reddit user's public profile."),
      operation("user-posts", "fetchlayer", "List posts by a known Reddit user."),
      operation("user-comments", "fetchlayer", "List comments by a known Reddit user."),
      operation("search-communities", "fetchlayer", "Find relevant subreddits by query."),
      operation("search-users", "fetchlayer", "Find public Reddit users by query."),
      operation("comment-permalink", "fetchlayer", "Resolve and fetch a specific Reddit comment."),
      operation("popular", "fetchlayer", "Discover currently popular Reddit content."),
      operation("leaderboard", "fetchlayer", "Inspect ranked Reddit communities or content."),
      operation(
        "resolve-url-type",
        "fetchlayer",
        "Determine what kind of Reddit resource a supplied URL identifies.",
      ),
      operation(
        "explore",
        "fetchlayer",
        "Explore Reddit when the best community is not yet known.",
      ),
    ],
  },
  x: {
    whenToUse:
      "Use X for timely public posts, conversation threads, profiles, and public follower relationships.",
    operations: [
      operation("search", "fetchlayer", "Search public X posts by query."),
      operation("tweet-detail", "fetchlayer", "Fetch a specific post and its metadata."),
      operation("tweet-replies", "fetchlayer", "Fetch replies to a specific post."),
      operation(
        "user-profile-details",
        "fetchlayer",
        "Fetch detailed information for a known public profile.",
      ),
      operation("about-profile", "fetchlayer", "Resolve summary information about a profile."),
      operation("user-tweets", "fetchlayer", "List posts from a known public profile."),
      operation("user-replies", "fetchlayer", "List replies from a known public profile."),
      operation("following", "fetchlayer", "List accounts followed by a public profile."),
      operation("followers", "fetchlayer", "List followers of a public profile."),
      operation(
        "verified-followers",
        "fetchlayer",
        "List verified followers of a public profile when authority signals matter.",
      ),
    ],
  },
  youtube: {
    whenToUse:
      "Use YouTube for video and channel discovery, video metadata or comments, and timestamped transcript evidence.",
    operations: [
      operation("search-videos", "api_direct", "Find YouTube videos by topic and date."),
      operation("search-channels", "api_direct", "Find YouTube channels by topic or name."),
      operation("channel-details", "api_direct", "Inspect a known YouTube channel."),
      operation("video-details", "api_direct", "Fetch metadata for a known YouTube video."),
      operation("video-comments", "api_direct", "Fetch public discussion for a known video."),
      operation(
        "transcript",
        "supadata",
        "Fetch the transcript for a selected video when its spoken content is relevant.",
      ),
    ],
  },
  facebook: {
    whenToUse:
      "Use Facebook for public pages, groups, posts, media, events, locations, reviews, and comments.",
    operations: [
      operation("page-details", "api_direct", "Inspect a known public Facebook page."),
      operation("page-posts", "api_direct", "List posts from a known public page."),
      operation("page-photos", "api_direct", "List photos from a known public page."),
      operation("page-videos", "api_direct", "List videos from a known public page."),
      operation("page-reels", "api_direct", "List reels from a known public page."),
      operation("page-reviews", "api_direct", "Fetch reviews for a known public page."),
      operation("group-details", "api_direct", "Inspect a known public Facebook group."),
      operation("group-posts", "api_direct", "List posts from a known public group."),
      operation("search-group-posts", "api_direct", "Search posts across public groups."),
      operation("post-comments", "api_direct", "Fetch comments for a known public post."),
      operation("search-posts", "api_direct", "Search public Facebook posts."),
      operation("search-pages", "api_direct", "Find public Facebook pages."),
      operation("search-videos", "api_direct", "Search public Facebook videos."),
      operation("search-events", "api_direct", "Search public Facebook events."),
      operation("search-locations", "api_direct", "Search public Facebook locations."),
    ],
  },
  news: {
    whenToUse:
      "Use News for current reporting, dated coverage, headlines, and corroboration across publishers.",
    operations: [
      operation("news-articles", "api_direct", "Search current news articles by query."),
    ],
  },
  forums: {
    whenToUse:
      "Use Forums for long-form public discussions and Q&A outside Reddit and Hacker News.",
    operations: [
      operation("forum-posts", "api_direct", "Search public forums and Q&A sites by query."),
    ],
  },
  places: {
    whenToUse:
      "Use Places for local businesses, physical locations, ratings, reviews, photos, and map details.",
    operations: [
      operation("places-search", "api_direct", "Find places matching a name, category, or area."),
      operation("place-details", "api_direct", "Fetch details for a selected place."),
      operation("place-reviews", "api_direct", "Fetch public reviews for a selected place."),
      operation("place-photos", "api_direct", "Fetch public photos for a selected place."),
    ],
  },
  linkedin: {
    whenToUse:
      "Use LinkedIn only to search public professional posts through API Direct's publicly documented endpoint.",
    operations: [operation("search-posts", "api_direct", "Search public LinkedIn posts.")],
  },
  hackernews: {
    whenToUse:
      "Use Hacker News for technology discussions, ranked story feeds, Ask HN, Show HN, jobs, and historical search.",
    operations: [
      operation("top-stories", "hacker_news_firebase", "Fetch the current top story IDs."),
      operation("new-stories", "hacker_news_firebase", "Fetch the newest story IDs."),
      operation("best-stories", "hacker_news_firebase", "Fetch the current best story IDs."),
      operation("ask-stories", "hacker_news_firebase", "Fetch current Ask HN story IDs."),
      operation("show-stories", "hacker_news_firebase", "Fetch current Show HN story IDs."),
      operation("job-stories", "hacker_news_firebase", "Fetch current Hacker News job IDs."),
      operation("item", "hacker_news_firebase", "Fetch a story, comment, poll, or job by ID."),
      operation("user", "hacker_news_firebase", "Fetch a public Hacker News user by ID."),
      operation("updates", "hacker_news_firebase", "Fetch recently changed item and profile IDs."),
      operation(
        "search",
        "hacker_news_algolia",
        "Search Hacker News stories and comments by relevance.",
      ),
      operation(
        "search-by-date",
        "hacker_news_algolia",
        "Search Hacker News stories and comments ordered by date.",
      ),
      operation(
        "algolia-item",
        "hacker_news_algolia",
        "Fetch an Algolia item with its normalized comment tree.",
      ),
      operation(
        "algolia-user",
        "hacker_news_algolia",
        "Fetch Algolia's public view of a Hacker News user.",
      ),
    ],
  },
  github: {
    whenToUse:
      "Use GitHub for public repositories, code, issues, pull requests, commits, releases, and developer profiles.",
    operations: [
      operation("search-repositories", "github", "Find repositories by topic, name, or metadata."),
      operation("search-code", "github", "Find code matching a query across public repositories."),
      operation(
        "search-issues-and-pull-requests",
        "github",
        "Find issues and pull requests matching a query.",
      ),
      operation("search-commits", "github", "Find commits matching a query."),
      operation("search-users", "github", "Find public users or organizations."),
      operation("search-topics", "github", "Find repository topics by query."),
      operation("repository", "github", "Fetch metadata for a selected repository."),
      operation("repository-readme", "github", "Fetch a selected repository's README."),
      operation("repository-contents", "github", "Inspect files in a selected repository."),
      operation("repository-tree", "github", "Inspect a repository tree recursively."),
      operation("repository-languages", "github", "Inspect a repository's language breakdown."),
      operation("repository-topics", "github", "Inspect a repository's declared topics."),
      operation("contributors", "github", "List contributors to a selected repository."),
      operation("issues", "github", "List issues for a selected repository."),
      operation(
        "issue-comments",
        "github",
        "Fetch conversation comments for a selected issue or pull request.",
      ),
      operation("pull-requests", "github", "List pull requests for a selected repository."),
      operation("pull-request", "github", "Fetch a selected pull request."),
      operation("pull-request-reviews", "github", "Fetch reviews for a selected pull request."),
      operation(
        "pull-request-review-comments",
        "github",
        "Fetch inline review comments for a selected pull request.",
      ),
      operation("commits", "github", "List commits for a selected repository."),
      operation("releases", "github", "List releases for a selected repository."),
      operation("user", "github", "Fetch a public user or organization profile."),
    ],
  },
} as const satisfies Record<AgentPlatform, PlatformSkillDefinition>;

function loaderName(platform: AgentPlatform): PlatformLoaderName {
  return `get_${platform}_tools`;
}

export const PLATFORM_DISCOVERY_MANIFEST: readonly PlatformDiscoveryTool[] = AGENT_PLATFORMS.map(
  (platform) => ({
    name: loaderName(platform),
    platform,
    description: `Load ${platform} operations only when this source is relevant. ${skillDefinitions[platform].whenToUse}`,
  }),
);

export function loadPlatformSkill(platform: AgentPlatform): PlatformSkill {
  const definition = skillDefinitions[platform];

  return {
    platform,
    loader: loaderName(platform),
    whenToUse: definition.whenToUse,
    operations: definition.operations,
  };
}

const platformCues = {
  reddit: [/\breddit\b/i, /reddit\.com/i, /\bsubreddits?\b/i, /(?:^|\s)r\/[a-z0-9_]+/i],
  x: [
    /\btwitter\b/i,
    /\bx\.com\/[a-z0-9_]/i,
    /twitter\.com/i,
    /\btweets?\b/i,
    /#[a-z0-9_]+/i,
    /(?:^|\s)@[a-z0-9_]+/i,
  ],
  youtube: [
    /\byoutube\b/i,
    /youtu\.be/i,
    /youtube\.com/i,
    /\bvideos?\b/i,
    /\bchannels?\b/i,
    /\btranscripts?\b/i,
  ],
  facebook: [/\bfacebook\b/i, /facebook\.com/i, /\bfacebook (?:pages?|groups?|posts?|reels?)\b/i],
  news: [/\bnews\b/i, /\bheadlines?\b/i, /\bbreaking\b/i, /\bpress coverage\b/i],
  forums: [
    /\bforums?\b/i,
    /\bdiscussion boards?\b/i,
    /\bmessage boards?\b/i,
    /\bq\s*(?:&|and)\s*a\b/i,
    /stackoverflow\.com/i,
  ],
  places: [
    /\bgoogle maps\b/i,
    /(?:maps\.google|google\.com\/maps)/i,
    /\bnear me\b/i,
    /\bnearby\b/i,
    /\brestaurants?\b/i,
    /\bhotels?\b/i,
    /\blocal business(?:es)?\b/i,
    /\bplace reviews?\b/i,
  ],
  linkedin: [/\blinkedin\b/i, /linkedin\.com/i, /\blinkedin posts?\b/i],
  hackernews: [
    /\bhacker news\b/i,
    /news\.ycombinator\.com/i,
    /\bask hn\b/i,
    /\bshow hn\b/i,
    /\bhn discussions?\b/i,
  ],
  github: [
    /\bgithub\b/i,
    /github\.com/i,
    /\brepositor(?:y|ies)\b/i,
    /\bcode search\b/i,
    /\bpull requests?\b/i,
    /\bcommits?\b/i,
    /\breleases?\b/i,
  ],
} as const satisfies Record<Exclude<AgentPlatform, "web">, readonly RegExp[]>;

const webCues = [/\bweb\b/i, /\bwebsites?\b/i, /\bweb pages?\b/i, /https?:\/\//i] as const;

export function selectPlatformsForQuery(
  query: string,
  allowedPlatforms: readonly AgentPlatform[],
  mode: PlatformSelectionMode,
): AgentPlatform[] {
  const allowed = [...new Set(allowedPlatforms)];

  if (mode === "manual" || allowed.length === 0) {
    return allowed;
  }

  const allowedSet = new Set(allowed);
  const selected = AGENT_PLATFORMS.filter((platform) => {
    if (!allowedSet.has(platform)) {
      return false;
    }

    if (platform === "web") {
      return webCues.some((cue) => cue.test(query));
    }

    const cueQuery = platform === "news" ? query.replace(/\bhacker\s+news\b/gi, "") : query;

    return platformCues[platform].some((cue) => cue.test(cueQuery));
  });

  if (selected.length > 0) {
    return selected;
  }

  return allowedSet.has("web") ? ["web"] : allowed.slice(0, 1);
}
