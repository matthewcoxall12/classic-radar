# ClassicsGo Google event/search verification — 10 October 2026

## Published corrections

PR #27 corrected a stale Vercel hostname in public canonical, schema and sitemap URLs. Public identity is pinned to `https://classicsgo.com`; both www and the old classic-radar.vercel.app hostname redirect permanently to the apex, preserving paths. Event leaf pages contain server-rendered linked Event/WebPage/BreadcrumbList JSON-LD. The site has linked Organization/WebSite identity and its genuine logo/contact.

Event location is a PostalAddress rather than a plain string, with actual coordinates when present. Known local hours include IANA timezone/DST offsets; unknown/all-day imported boundaries remain date-only. Same-day end hours and multi-day dates are retained, and visible dates match. Cancelled events retain their date/location with EventCancelled and no purchase offer. Prices are parsed only from unambiguous free/single-GBP admission text, never ranges, donation minima or concessions. Ticket availability and performers are not invented. Free walk-in event information links are not asserted to be ticket checkout URLs. Ratings require real available member-review totals; images use only reviewed photographs or valid publisher uploads.

The sitemap independently paginates anonymous RLS-visible published/cancelled events, including archives, with real event update timestamps. It is generated dynamically; database errors fail rather than presenting an incomplete sitemap as complete. No private/draft/review pages enter the sitemap. The flat sitemap supports up to the protocol's 50,000 URL limit; introduce an index/chunks before that scale.

The canonical event directory now shows UK events without first requiring location input. Pagination has its own canonical; filtered search combinations are noindex/follow. Admin pages are noindex; existing account/private Roadbook/publication controls remain protected.

## Verification evidence

- Lint, TypeScript, all 71 tests and production build passed. Independent schema/crawlability review completed.
- Production release 707102cfa1226f66a5662c21cbd8610e67e1a494 was READY (dpl_8NWJcrUaHB1iLhUyhrxoW9sDUDzD). Subsequent offer-link hardening does not change required event fields.
- Read-only audit of all 83 public pages: 82 Event pages, one intentionally omitted from Event markup because its current venue is not public/confirmed; zero canonical, JSON-LD, status, structured address or sitemap coverage errors. All 83 listings occur in the 92-URL sitemap.
- Google Rich Results Test fetched the live Veteran Car Run page successfully at 19:49 UK: three valid items (Event, Breadcrumbs, Organization), no critical errors. Optional offers/performer suggestions remain because no reliable offer/performer is supplied. Result: https://search.google.com/test/rich-results/result?id=aYXHeqBvbQGiOekxfndm_g
- A second live Google test at 19:51 UK confirmed three valid items for the timed/free British Classic Car Club meet. Result: https://search.google.com/test/rich-results/result?id=uxkwW0bMFlCApq3jMSXtlA
- Submitted https://classicsgo.com/sitemap.xml through the owner's personal Search Console property. The detail report confirmed **Sitemap processed successfully**, last read 10/10/2026, **92 discovered pages**. The initial unprocessed table state subsequently resolved; successful processing is confirmed, not merely submission.
- Browser screenshots and the machine-readable audit are saved in workspace `work/artifacts/`: google-rich-results-valid-2026-10-10.png, google-timed-event-valid-2026-10-10.png, google-sitemap-success-2026-10-10.png, schema-audit-live-2026-10-10.json.

## Verified listing corrections

Corrected the three upcoming listings with blank descriptions using primary sources. Original public rows were saved in workspace artifacts before the narrow updates.

- Veteran Car Run: official start is Hyde Park, South Carriage Drive, London; finish is Madeira Drive, Brighton. Replaced the route-as-town placeholder, named the Royal Automobile Club, removed artificial midnight opening hours, and supplied a concise spectator description. Postcode and admission prices remain unknown. Sources: https://www.veterancarrun.com/directions and https://www.veterancarrun.com/faqs
- HSCC Finals: added factual historic-racing description, National Circuit venue and event-specific spectator-ticket destination; unknown opening hours remain date-only. https://www.silverstone.co.uk/events/hscc-finals
- Walter Hayes Trophy: added factual Formula Ford description, National Circuit venue and event-specific spectator-ticket destination; unknown opening hours remain date-only. https://www.silverstone.co.uk/events/walter-hayes-trophy
- GCCG North East: the official page hides venue details behind membership. No location was guessed from an image filename. Its useful directory page remains available, but it does not claim Google Event eligibility. https://www.gccg.org.uk/events/north-east-pub-meet-2026-11-05/

## Limits

Google eligibility is not guaranteed indexing, ranking or rich-result display. Search Console aggregate reporting is still processing its new property. Missing optional admission/photo/organiser facts in individual listings must be verified with organisers before adding them. This search work does not enable payments or remove the separate Google OAuth branding wait / Squarespace recovery / welcome-sender DNS blockers.

Official requirements: https://developers.google.com/search/docs/appearance/structured-data/event and https://developers.google.com/search/docs/appearance/structured-data/sd-policies
