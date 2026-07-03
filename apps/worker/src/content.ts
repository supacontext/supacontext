import type { NormalizedSourceCandidate, TranscriptSegment } from "@supacontext/providers";
import type { Platform } from "@supacontext/core";
import { cleanPublicText, type PublicSource } from "./public-result.js";

export type NormalizedEvidenceSource = {
  sourceId: string;
  candidate: NormalizedSourceCandidate;
  cleanedContent: string;
  tokenEstimate: number;
};

export type EvidenceChunk = {
  id: string;
  sourceId: string;
  platform: Platform;
  title: string;
  url: string;
  publishedAt: string | null;
  text: string;
  tokenEstimate: number;
  startSeconds?: number;
  endSeconds?: number | null;
  prefilterScore: number;
};

export type ChunkingOptions = {
  directTokenLimit: number;
  chunkTokenLimit: number;
};

export function cleanContent(value: string): string {
  const cleaned = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > 60_000 ? `${cleaned.slice(0, 59_997).trim()}...` : cleaned;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function normalizeCandidates(candidates: NormalizedSourceCandidate[]): NormalizedEvidenceSource[] {
  const seen = new Map<string, NormalizedEvidenceSource>();

  for (const candidate of candidates) {
    const cleanedContent = cleanContent(candidate.content);

    if (!cleanedContent) {
      continue;
    }

    const key = sourceKey(candidate);
    const existing = seen.get(key);

    if (existing) {
      if (cleanedContent.length > existing.cleanedContent.length) {
        existing.cleanedContent = cleanedContent;
        existing.tokenEstimate = estimateTokens(cleanedContent);
        existing.candidate = {
          ...candidate,
          content: cleanedContent,
        };
      }

      continue;
    }

    const sourceId = `src_${seen.size + 1}`;
    seen.set(key, {
      sourceId,
      candidate: {
        ...candidate,
        title: cleanPublicText(candidate.title, 300),
        content: cleanedContent,
        summary: cleanPublicText(candidate.summary || cleanedContent, 700),
      },
      cleanedContent,
      tokenEstimate: estimateTokens(cleanedContent),
    });
  }

  return [...seen.values()];
}

export function toPublicSources(sources: NormalizedEvidenceSource[]): PublicSource[] {
  return sources.map((source) => ({
    id: source.sourceId,
    platform: source.candidate.platform,
    title: cleanPublicText(source.candidate.title, 300),
    url: source.candidate.url,
    published_at: source.candidate.publishedAt,
    summary: cleanPublicText(source.candidate.summary || source.cleanedContent, 700),
  }));
}

export function chunkSources(
  sources: NormalizedEvidenceSource[],
  options: ChunkingOptions,
): EvidenceChunk[] {
  return sources.flatMap((source) => chunkSource(source, options));
}

export function prefilterChunks(
  query: string,
  chunks: EvidenceChunk[],
  limit: number,
): EvidenceChunk[] {
  const terms = queryTerms(query);

  return chunks
    .map((chunk) => ({
      ...chunk,
      prefilterScore: scoreChunk(terms, chunk),
    }))
    .sort((left, right) => right.prefilterScore - left.prefilterScore || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function sourceKey(candidate: NormalizedSourceCandidate): string {
  try {
    const url = new URL(candidate.url);
    url.hash = "";

    return `${candidate.platform}:${url.toString().toLowerCase()}`;
  } catch {
    return `${candidate.platform}:${candidate.url.toLowerCase()}`;
  }
}

function chunkSource(source: NormalizedEvidenceSource, options: ChunkingOptions): EvidenceChunk[] {
  if (source.tokenEstimate <= options.directTokenLimit) {
    return [buildChunk(source, 1, source.cleanedContent, source.tokenEstimate)];
  }

  const segments = source.candidate.metadata?.transcriptSegments;

  if (segments && segments.length > 0) {
    return chunkTranscript(source, segments, options.chunkTokenLimit);
  }

  return chunkText(source, options.chunkTokenLimit);
}

function buildChunk(
  source: NormalizedEvidenceSource,
  index: number,
  text: string,
  tokenEstimate: number,
  timing?: {
    startSeconds?: number;
    endSeconds?: number | null;
  },
): EvidenceChunk {
  return {
    id: `chunk_${source.sourceId}_${index}`,
    sourceId: source.sourceId,
    platform: source.candidate.platform,
    title: source.candidate.title,
    url: source.candidate.url,
    publishedAt: source.candidate.publishedAt,
    text,
    tokenEstimate,
    prefilterScore: 0,
    ...(timing?.startSeconds === undefined ? {} : { startSeconds: timing.startSeconds }),
    ...(timing?.endSeconds === undefined ? {} : { endSeconds: timing.endSeconds }),
  };
}

function chunkTranscript(
  source: NormalizedEvidenceSource,
  segments: TranscriptSegment[],
  chunkTokenLimit: number,
): EvidenceChunk[] {
  const chunks: EvidenceChunk[] = [];
  let bucket: TranscriptSegment[] = [];
  let bucketTokens = 0;

  for (const segment of segments) {
    const text = cleanContent(segment.text);
    const segmentTokens = estimateTokens(text);

    if (bucket.length > 0 && bucketTokens + segmentTokens > chunkTokenLimit) {
      chunks.push(buildTranscriptChunk(source, chunks.length + 1, bucket));
      bucket = [];
      bucketTokens = 0;
    }

    bucket.push({
      ...segment,
      text,
    });
    bucketTokens += segmentTokens;
  }

  if (bucket.length > 0) {
    chunks.push(buildTranscriptChunk(source, chunks.length + 1, bucket));
  }

  return chunks;
}

function buildTranscriptChunk(
  source: NormalizedEvidenceSource,
  index: number,
  segments: TranscriptSegment[],
): EvidenceChunk {
  const text = segments.map((segment) => segment.text).join("\n");
  const first = segments[0];
  const last = segments.at(-1);

  return buildChunk(source, index, text, estimateTokens(text), {
    ...(first ? { startSeconds: first.startSeconds } : {}),
    ...(last?.endSeconds === undefined ? {} : { endSeconds: last.endSeconds }),
  });
}

function chunkText(source: NormalizedEvidenceSource, chunkTokenLimit: number): EvidenceChunk[] {
  const paragraphs = source.cleanedContent
    .split(/\n{2,}|(?=\n#{1,6}\s)/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const units = paragraphs.length > 0 ? paragraphs : splitSentences(source.cleanedContent);
  const chunks: EvidenceChunk[] = [];
  let bucket: string[] = [];
  let bucketTokens = 0;

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);

    if (bucket.length > 0 && bucketTokens + unitTokens > chunkTokenLimit) {
      const text = bucket.join("\n\n");
      chunks.push(buildChunk(source, chunks.length + 1, text, estimateTokens(text)));
      bucket = [];
      bucketTokens = 0;
    }

    if (unitTokens > chunkTokenLimit) {
      for (const split of splitLongText(unit, chunkTokenLimit)) {
        chunks.push(buildChunk(source, chunks.length + 1, split, estimateTokens(split)));
      }
      continue;
    }

    bucket.push(unit);
    bucketTokens += unitTokens;
  }

  if (bucket.length > 0) {
    const text = bucket.join("\n\n");
    chunks.push(buildChunk(source, chunks.length + 1, text, estimateTokens(text)));
  }

  return chunks;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitLongText(text: string, tokenLimit: number): string[] {
  const charLimit = tokenLimit * 3;
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += charLimit) {
    chunks.push(text.slice(index, index + charLimit).trim());
  }

  return chunks.filter(Boolean);
}

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3),
    ),
  ];
}

function scoreChunk(terms: string[], chunk: EvidenceChunk): number {
  if (terms.length === 0) {
    return 1;
  }

  const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();

  return terms.reduce((score, term) => score + countOccurrences(haystack, term), 0);
}

function countOccurrences(value: string, term: string): number {
  let count = 0;
  let index = value.indexOf(term);

  while (index !== -1) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }

  return count;
}
