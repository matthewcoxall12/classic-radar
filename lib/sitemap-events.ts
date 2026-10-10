export type SitemapEvent = { id: string; slug: string; updated_at: string | null };

// Discovery has date filters and a display cap; the sitemap must cover every
// public listing. Keyset pagination also avoids skipping rows on deletion.
export async function collectSitemapEvents(
  fetchPage: (afterId: string | undefined, limit: number) => Promise<SitemapEvent[]>,
): Promise<SitemapEvent[]> {
  const events: SitemapEvent[] = [];
  let afterId: string | undefined;
  while (true) {
    const page = await fetchPage(afterId, 200);
    if (page.length === 0) return events;
    const nextId = page[page.length - 1].id;
    if (!nextId || (afterId && nextId <= afterId)) {
      throw new Error("ClassicsGo sitemap pagination did not advance");
    }
    events.push(...page);
    afterId = nextId;
  }
}

export function sitemapEventEntry(event: SitemapEvent, base: URL) {
  const updated = event.updated_at ? new Date(event.updated_at) : undefined;
  return {
    url: new URL(`/events/${encodeURIComponent(event.slug)}`, base).toString(),
    ...(updated && Number.isFinite(updated.getTime()) ? { lastModified: updated } : {}),
  };
}
