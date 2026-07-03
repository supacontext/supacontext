import type { Platform, ProviderName } from "@supacontext/core";

export type ProviderSearchInput = {
  query: string;
  platform: Platform;
  limit: number;
};

export type ProviderContextChunk = {
  title: string;
  url: string;
  snippet: string;
  platform: Platform;
  publishedAt?: string;
};

export type ProviderSearchResult = {
  provider: ProviderName;
  chunks: ProviderContextChunk[];
};

export interface ProviderClient {
  readonly name: ProviderName;
  search(input: ProviderSearchInput): Promise<ProviderSearchResult>;
}

export class ProviderNotImplementedError extends Error {
  constructor(provider: ProviderName) {
    super(`${provider} provider is a typed placeholder and has no API calls yet.`);
    this.name = "ProviderNotImplementedError";
  }
}

class PlaceholderProviderClient implements ProviderClient {
  constructor(readonly name: ProviderName) {}

  async search(_input: ProviderSearchInput): Promise<ProviderSearchResult> {
    throw new ProviderNotImplementedError(this.name);
  }
}

export function createExaClient(): ProviderClient {
  return new PlaceholderProviderClient("exa");
}

export function createFetchLayerClient(): ProviderClient {
  return new PlaceholderProviderClient("fetchlayer");
}

export function createXquikClient(): ProviderClient {
  return new PlaceholderProviderClient("xquik");
}

export function createSupadataClient(): ProviderClient {
  return new PlaceholderProviderClient("supadata");
}

export function createDeepSeekClient(): ProviderClient {
  return new PlaceholderProviderClient("deepseek");
}

export function createVoyageClient(): ProviderClient {
  return new PlaceholderProviderClient("voyage");
}

export function createProviderClients(): Record<ProviderName, ProviderClient> {
  return {
    exa: createExaClient(),
    fetchlayer: createFetchLayerClient(),
    xquik: createXquikClient(),
    supadata: createSupadataClient(),
    deepseek: createDeepSeekClient(),
    voyage: createVoyageClient(),
  };
}

