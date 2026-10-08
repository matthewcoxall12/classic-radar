# ClassicsGo redesign validation — 8 October 2026
Branch: codex/classicsgo-editorial-redesign. Baseline: origin/main 98d16f5. Production rollback: dpl_3xgTFzot3YibdyACNgGekJXsCVPB.

## Automated checks
ESLint: pass with no warnings. TypeScript: pass. Next.js 16.4.0 production build: pass. Node 24 test suite: 17 passed, 0 failed. Production npm audit: 0 vulnerabilities. Existing development tooling advisories remain; no force upgrades were made. Added coverage for Sunday weekend queries, year boundaries, local date/distance ordering and absent distances.

## Live data and routes
Production-build local checks returned HTTP 200 on home, events, clubs, membership, sign-in, about, contact, policies, photography, sitemap and robots. Signed-out account/submission routes redirect to sign-in; admin shows its access guard. UK event pagination returned 30 and 17 published listings; Silverstone keyword and NN12 8TN / 50-mile searches returned two listings. Club meet / this weekend returned three. An unmatched keyword displayed the empty state. The Vercel preview returned matching real data on home, page two, keyword search, detail and clubs. Event detail contains Event JSON-LD and official links. No event or member records were created during QA.

## Browser inspection
Inspected production-build pages at 1440 × 960, 820 × 1180 and 390 × 844. Home, finder and details retain readable layout without horizontal overflow. Mobile menu opens/closes; collapsed refinements expand; keyword submission and postcode radius filtering work. List/map toggle loads real coordinates and OpenStreetMap tiles. All map events also have keyboard reachable links. Club and Roadbook pages remain clear on mobile. Images load from the local optimized assets.

## Limits and release check
The existing GoogleSignIn implementation allows sign-in only on classicsgo.com and www.classicsgo.com. Preview stays read-only. Member save/attendance, profile edits, submissions and admin publication mutations therefore were not executed in the preview. Their existing authorization and database actions remain, and ingestion tests confirm review-only behaviour. During approved release, use an existing signed-in account to verify save/unsave, attendance, account tabs, submission validation and admin review without publishing invented events. Geolocation permission was not granted during QA; coordinate validation and geocoding are unit-tested. Field Core Web Vitals need production traffic; no field performance claim is made.

## Design audit (implementation review)
| Area | Score / 10 | Evidence |
| --- | --- | --- |
| Editorial hierarchy | 9 | Distinct split hero, large serif titles, generous whitespace |
| Domain fit | 9 | Real Jaguar and MG photography, calendar-first content |
| Palette consistency | 9 | Shared ivory, racing green, stone and brass tokens |
| Typography | 8 | Locally served display, body and utility fonts |
| Event usefulness | 9 | Dates, location, admission, organiser, verification, actions |
| Search | 9 | Keyword, location, radius, date, category and sorting |
| Mobile | 9 | Single-column cards, compact navigation, refinements |
| Accessibility | 8 | Labels, focus, keyboard controls, reduced motion; manual review |
| Content integrity | 9 | Published data only, explicit unverified/fallback labels |
| Maintainability | 8 | Shared components and tokens, preserved backend, lazy map |

Scores are design review judgements, not an automated accessibility certification. Club profiles and Roadbook plans/alerts are upcoming, not operational products.

## Opening-image refinement — 8 October 2026
The homepage now uses a smaller 3:2 AI-generated illustration of a worn Austin A35 van, everyday classic cars and people chatting at a village-hall meet. The visible caption, alt text and photography page identify the image as fictional. Event listing photography and published records are unchanged. Hero bounds checked at 1440px (approximately 561 x 374px) and 390px (342 x 228px), without horizontal overflow. Lint, typecheck and production build pass.

## Event-image refinement — 8 October 2026
Event cards and detail pages use only photographs in the reviewed local event-photo manifest. Licensed photos from London to Brighton 2024 (Jon Lavis, CC BY 2.0) and Festival of Speed 2024 (Francisco Antunes, CC BY 2.0) are matched to their corresponding listings and explicitly labelled as previous editions. Most local meets have no approved image and now use a date panel. Discovered image_url values are not used as proof of permission; two existing HSCC values point to HTML calendars. Event metadata no longer exposes these HTML URLs or unrelated stock photographs as event imagery. Credits appear below actual event images, with full attribution and adaptation details on /photography. No database records, security policy, or ingestion publishing rules were changed. Unit checks cover unreviewed/inherited slug rejection and invalid dates; 19 tests pass. Desktop and 390px mobile layouts inspected.
