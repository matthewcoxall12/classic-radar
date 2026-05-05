import type { SearchQuery } from "../query-engine.ts";

export type SearchProvider = {
  name: string;
  search(query: SearchQuery): Promise<SearchResult[]>;
};

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  dateText?: string;
  locationText?: string;
  imageUrl?: string;
  provider: string;
};
