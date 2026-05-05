import { MockSearchProvider } from "./mock-search-provider.ts";
import type { SearchProvider, SearchResult } from "./types.ts";

export class WebSearchProvider implements SearchProvider {
  name: string;

  constructor(
    private apiKey = process.env.SEARCH_PROVIDER_API_KEY,
    providerName = process.env.SEARCH_PROVIDER_NAME
  ) {
    this.name = providerName || "web-search";
  }

  async search(): Promise<SearchResult[]> {
    if (!this.apiKey) {
      return new MockSearchProvider().search();
    }

    // Wire a compliant public search provider here. Keep rate limits conservative.
    return new MockSearchProvider().search();
  }
}
