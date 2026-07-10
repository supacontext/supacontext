import { describe, expect, it } from "vitest";
import {
  AGENT_PLATFORMS,
  PLATFORM_DISCOVERY_MANIFEST,
  loadPlatformSkill,
  selectPlatformsForQuery,
} from "../index.js";

describe("platform skill discovery", () => {
  it("exposes exactly one lazy loader per platform without operation details", () => {
    expect(PLATFORM_DISCOVERY_MANIFEST).toHaveLength(AGENT_PLATFORMS.length);
    expect(PLATFORM_DISCOVERY_MANIFEST.map((tool) => tool.name)).toEqual(
      AGENT_PLATFORMS.map((platform) => `get_${platform}_tools`),
    );
    expect(new Set(PLATFORM_DISCOVERY_MANIFEST.map((tool) => tool.platform)).size).toBe(
      AGENT_PLATFORMS.length,
    );
    expect(JSON.stringify(PLATFORM_DISCOVERY_MANIFEST)).not.toContain("tweet-detail");
    expect(JSON.stringify(PLATFORM_DISCOVERY_MANIFEST)).not.toContain("search-repositories");
  });

  it("loads complete FetchLayer Reddit and X operation lists only on demand", () => {
    expect(loadPlatformSkill("reddit").operations.map((item) => item.name)).toEqual([
      "search",
      "search-comments",
      "post",
      "community-posts",
      "community-details",
      "user-profile",
      "user-posts",
      "user-comments",
      "search-communities",
      "search-users",
      "comment-permalink",
      "popular",
      "leaderboard",
      "resolve-url-type",
      "explore",
    ]);
    expect(loadPlatformSkill("x").operations.map((item) => item.name)).toEqual([
      "search",
      "tweet-detail",
      "tweet-replies",
      "user-profile-details",
      "about-profile",
      "user-tweets",
      "user-replies",
      "following",
      "followers",
      "verified-followers",
    ]);
    expect(loadPlatformSkill("linkedin").operations.map((item) => item.name)).toEqual([
      "search-posts",
    ]);
  });

  it("loads the full documented API Direct, Hacker News, and GitHub surfaces", () => {
    expect(loadPlatformSkill("facebook").operations).toHaveLength(15);
    expect(loadPlatformSkill("youtube").operations).toHaveLength(6);
    expect(loadPlatformSkill("news").operations).toHaveLength(1);
    expect(loadPlatformSkill("forums").operations).toHaveLength(1);
    expect(loadPlatformSkill("places").operations).toHaveLength(4);
    expect(loadPlatformSkill("hackernews").operations).toHaveLength(13);
    expect(loadPlatformSkill("github").operations.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "search-code",
        "repository-tree",
        "repository-languages",
        "contributors",
        "pull-request-reviews",
        "pull-request-review-comments",
        "user",
      ]),
    );
  });

  it("keeps unselected platform operations out of the loaded tool set", () => {
    const selected = selectPlatformsForQuery(
      "Find the GitHub repository and recent Hacker News discussion",
      AGENT_PLATFORMS,
      "auto",
    );
    const visibleOperations = selected.flatMap((platform) =>
      loadPlatformSkill(platform).operations.map((item) => `${platform}:${item.name}`),
    );

    expect(selected).toEqual(["hackernews", "github"]);
    expect(visibleOperations).toContain("github:search-repositories");
    expect(visibleOperations).toContain("hackernews:search-by-date");
    expect(visibleOperations).not.toContain("x:tweet-detail");
    expect(visibleOperations).not.toContain("reddit:search-comments");
  });
});

describe("platform selection", () => {
  it("honors manual platform selection and preserves its order", () => {
    expect(
      selectPlatformsForQuery("Search GitHub instead", ["reddit", "youtube", "reddit"], "manual"),
    ).toEqual(["reddit", "youtube"]);
  });

  it("selects relevant allowed platforms from keyword and entity cues", () => {
    expect(
      selectPlatformsForQuery(
        "Compare r/typescript sentiment with @typescript and YouTube videos",
        AGENT_PLATFORMS,
        "auto",
      ),
    ).toEqual(["reddit", "x", "youtube"]);
  });

  it("uses web as the fallback and never selects a disallowed platform", () => {
    expect(selectPlatformsForQuery("Explain vector databases", AGENT_PLATFORMS, "auto")).toEqual([
      "web",
    ]);
    expect(
      selectPlatformsForQuery("Find this project on GitHub", ["web", "reddit"], "auto"),
    ).toEqual(["web"]);
  });
});
