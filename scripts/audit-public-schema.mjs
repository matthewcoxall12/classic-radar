// Read-only production audit; uses only the public anonymous key and public URLs.
// Usage: node scripts/audit-public-schema.mjs [https://classicsgo.com]
import { supabaseUrl, supabasePublishableKey } from "../lib/supabase/config.ts";

const base = new URL(process.argv[2] || "https://classicsgo.com");
const canonical = "https://classicsgo.com";
const errors = [];
const rows = [];
let afterId;
for (;;) {
  const url = new URL("/rest/v1/events", supabaseUrl);
  url.searchParams.set("select", "id,slug,title,address,town,postcode,description,price_text,country_code,status");
  url.searchParams.set("status", "in.(published,cancelled)");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", "200");
  if (afterId) url.searchParams.set("id", `gt.${afterId}`);
  const response = await fetch(url, { headers: { apikey: supabasePublishableKey }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public event lookup HTTP ${response.status}`);
  const page = await response.json();
  if (!page.length) break;
  rows.push(...page);
  const nextId = page.at(-1).id;
  if (afterId && nextId <= afterId) throw new Error("Public event pagination did not advance");
  afterId = nextId;
}

const sitemapResponse = await fetch(new URL("/sitemap.xml", base));
const sitemap = await sitemapResponse.text();
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
if (!sitemapResponse.ok || locations.length === 0) errors.push("Sitemap unavailable or empty");
for (const url of locations) if (new URL(url).origin !== canonical) errors.push(`Wrong sitemap origin: ${url}`);
const expected = new Set(rows.map(row => `${canonical}/events/${encodeURIComponent(row.slug)}`));
for (const url of expected) if (!locations.includes(url)) errors.push(`Missing sitemap event: ${url}`);
const robots = await (await fetch(new URL("/robots.txt", base))).text();
if (!robots.includes(`Sitemap: ${canonical}/sitemap.xml`)) errors.push("Wrong robots sitemap reference");

const results = [];
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  for (;;) {
    const row = rows[next++];
    if (!row) return;
    const path = `/events/${encodeURIComponent(row.slug)}`;
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const problems = [];
    if (!response.ok) problems.push(`HTTP ${response.status}`);
    const canonicalUrl = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
    if (canonicalUrl !== `${canonical}${path}`) problems.push(`Wrong canonical ${canonicalUrl}`);
    if (/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html)) problems.push("Public listing is noindex");
    const graphs = [];
    for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try { const data = JSON.parse(match[1]); graphs.push(...(data["@graph"] || [data])); }
      catch { problems.push("Unparseable JSON-LD"); }
    }
    const events = graphs.filter(item => item["@type"] === "Event");
    const excluded = ![row.address, row.town, row.postcode].some(value => value?.trim()) ||
      /\b(?:members[ -]only|invitation[ -]only|private event)\b/i.test([row.title, row.description, row.price_text].join(" "));
    if (events.length !== (excluded ? 0 : 1)) problems.push(`Expected ${excluded ? 0 : 1} Event, got ${events.length}`);
    const event = events[0];
    if (event) {
      if (!event.name || !event.startDate) problems.push("Missing name/startDate");
      if (event.location?.["@type"] !== "Place" || event.location?.address?.["@type"] !== "PostalAddress") problems.push("Invalid structured location");
      if (event.url !== `${canonical}${path}`) problems.push("Wrong Event URL");
      if (row.country_code === "GB" && event.startDate.includes("T") && !/[+-]\d{2}:\d{2}$/.test(event.startDate)) problems.push("UK time has no explicit offset");
      const expectedStatus = `https://schema.org/${row.status === "cancelled" ? "EventCancelled" : "EventScheduled"}`;
      if (event.eventStatus !== expectedStatus) problems.push("Wrong event status");
    }
    if (!graphs.some(item => item["@type"] === "BreadcrumbList")) problems.push("Missing breadcrumb markup");
    if (!graphs.some(item => item["@type"] === "Organization" && item.url === `${canonical}/`)) problems.push("Missing canonical publisher identity");
    for (const problem of problems) errors.push(`${row.slug}: ${problem}`);
    results.push({ slug: row.slug, eventMarkup: events.length === 1, intentionallyExcluded: excluded, problems });
  }
}));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), source: base.origin, publicEvents: rows.length,
  sitemapUrls: locations.length, sitemapEvents: locations.filter(url => expected.has(url)).length,
  validEventPages: results.filter(row => row.eventMarkup && !row.problems.length).length,
  intentionallyExcluded: results.filter(row => row.intentionallyExcluded).map(row => row.slug), errors }, null, 2));
if (errors.length) process.exitCode = 1;
