# ClassicsGo event coverage and discovery audit — 10 October 2026

Live project: `rnayhhsurmztrohtftqo`. Counts checked against production using SQL after the ingestion repair and full discovery run.

## Coverage

- 400 total records: 83 published, 213 awaiting editorial review, 104 rejected.
- 69 current/upcoming published UK events; 14 past published events remain accessible as history and are excluded from current search by `coalesce(end_date,start_date)`.
- Current listing dates: October 2026: 41; November: 20; December: 4; July 2027: 4.
- Current listings span 30 county/region labels, including Scotland and Northern Ireland. Coverage is sparse and no current published Welsh event was established. This is not exhaustive nationwide coverage or a directory of thousands.
- No exact same-title/date/venue duplicates; an additional punctuation-insensitive title/date check found none. This does not prove no semantic near-duplicates.
- No end date preceding start date.

## Repairs applied

1. Discovery failed twice on 10 October with HTTP 500. Function logs show `permission denied for schema private` while the trusted service role enters the member-event trigger. The combined IF resolved `private.is_admin()` before the trusted-role early return. Migration `20261010133150_separate_trusted_event_ingestion_guard.sql` splits the trusted-role return into its own IF. It adds no schema/helper grants and leaves member validation unchanged.
2. Missing photograph metadata was becoming a webpage URL because `new URL('', base)` resolves to the page itself. The crawler now rejects blank/non-string URL inputs; JSON-LD and OpenGraph regression assertions cover this.
3. Six published listings at Ace Cafe (two), Waterloo Arms (two), and Cross Hands Hotel (two) now have verified venue coordinates, town, address and postcode. Original records are retained in `work/artifacts/event-coverage-data-2026-10-10.json` outside the repository. Source venue pages:
   - https://www.gccg.org.uk/locations/ace-cafe-3/
   - https://www.gccg.org.uk/locations/waterloo-arms/
   - https://www.gccg.org.uk/locations/cross-hands-hotel/
4. Two UK discovery catalogue start URLs returned 404. Updated using their official live event pages:
   - Austin Healey Club: `https://www.austinhealeyclub.com/events/` → https://www.austinhealeyclub.com/pages/action-planner.html
   - RREC: `https://rrec.org.uk/events` → https://rrec.org.uk/about/events
   Separate one-source GitHub runs subsequently completed successfully.

## Verification

- Rollback-only service-role update reproduced the private-schema error before the change and passed afterwards.
- Expanded `tests/self-service-events.sql` passed on production with all test mutations rolled back: trusted ingestion without private-schema USAGE; owner publishing/edit/cancel; metadata forgery protections; postcode/date/URL validation; quota; cross-owner isolation; attendance counts; image-folder isolation.
- Ten Node discovery/merge tests passed.
- Real discovery run https://github.com/matthewcoxall12/classic-radar/actions/runs/38056135038 succeeded (17 existing candidates updated).
- Full run https://github.com/matthewcoxall12/classic-radar/actions/runs/38056219774 completed successfully at the workflow level: 69 sources, 176 fetched pages, 66 candidates, seven private review records created and 58 existing records updated. Database run status is correctly `partial` for source-level warnings, not a failed ingestion. No machine candidate was automatically published.
- Austin Healey source verification: https://github.com/matthewcoxall12/classic-radar/actions/runs/38056405120
- RREC source verification: https://github.com/matthewcoxall12/classic-radar/actions/runs/38056407425
- Ace Cafe location search at a one-mile radius now returns both repaired listings.
- Security advisors introduced no new access grants. Existing intentional restricted/private tables have RLS with no client policies; token-based shared Roadbook and authenticated account export/delete functions remain intentional SECURITY DEFINER endpoints. Leaked-password protection remains an existing separate configuration warning.

## Link check

51 unique organiser/booking URLs from all 83 published records were fetched: 49 returned HTTP success and two returned 404. Both 404s belong to past August British Motor Museum events, not upcoming listings:

- https://www.britishmotormuseum.co.uk/whats-on/young-driver-cc-aug
- https://www.britishmotormuseum.co.uk/whats-on/the-ultimate-german-car-meet

Historical event source URLs were retained rather than replaced with unrelated current events. HTTP success does not certify page content, future availability, membership access or Facebook visibility for every visitor. Results: `work/artifacts/event-link-check-2026-10-10.json`.

## Remaining data limitations

- 38 current listings still lack coordinates (down from 44); 36 lack town. These cannot appear in radius searches until exact venue information is verified. County/keyword/date search still includes them. Two use explicit venue placeholders; do not invent destinations.
- Remaining list: `work/artifacts/event-coverage-remaining-2026-10-10.json`.
- Discovery still reports some legitimate remote access/redirect/PDF/robots restrictions, plus an unresolved Historic Vehicle Events hostname. The repair does not bypass remote restrictions or assume a different business owns that source.
- Most listings do not have a reusable event photograph. The UI intentionally uses approved reusable photos or owner uploads; discovered image metadata is not proof of reuse permission.
- Directory growth needs a continuing verified organiser/source intake and editorial review. Paid outreach should not claim exhaustive UK coverage or thousands of live events.
