# ClassicsGo launch audit — 10 October 2026

## Implemented and checked

- Immediate signed-in member publication, full event details, official/booking links and optional owned image upload. Owners edit, cancel and restore listings.
- Database ownership, unverified community defaults, protected source/attendance fields, UK postcode/coordinates/date/time/URL validation, daily publishing and upload limits.
- Cancelled public URLs remain useful with a clear notice; cancelled events leave search results and cannot receive new attendance/saves through the website.
- Free attendance; premium-only private wishlist; private trip ordering/notes; optional revocable token sharing; authenticated all-day calendar export.
- Sharing returns explicitly selected public fields, never private notes, owner IDs or raw private tables. Expired entitlements cannot save or share.
- Google button remount, network failure recovery, safe return destinations, live-session checks for sensitive account controls and no email-based automatic administrator grants.
- Search filters run before pagination, including local searches beyond the former 200-row cap. Stable ordering, ongoing events and London calendar dates are covered.
- Personal public/contact/operational email: matthewcoxall@googlemail.com. Homepage meet illustration includes Austin A35 van, Mini, Morris Minor, MG Midget and people; no image captions. Attribution and illustration disclosure remain on the credits page.

## Evidence

Lint, TypeScript and 39 unit tests passed; the main audit production build passed. Six rollback-only database suites cover session security, administrator defaults, self-service publishing, premium/privacy/attendance, search pagination and caller-only account export/deletion. Synthetic fixtures do not remain in production. Desktop and 390px mobile homepage were visually checked; no horizontal overflow.

Eight coordinated database migrations were applied to rnayhhsurmztrohtftqo. The final migration restores missing caller-only account RPCs with recent/live-session checks and includes caller-owned published events in exports. Welcome function v4 deployed with JWT verification retained. No transactional email credentials are configured, so welcome delivery remains disabled; login does not depend on it. Personal Reply-To is ready for a future verified transactional sender.

Production browser checks passed personal Google redirect sign-in, attendance and wishlist persistence after reload, private Roadbook notes, optional public sharing without private notes, revoked-link 404, an actual calendar download, event-editor URL rejection with retained input, and saving edits to a cancelled listing without publishing it. Account export initially exposed the missing RPC and now reports a successful download after repair. Temporary trips, attendance, wishlist and cancelled listing fixtures were removed. No real account was deleted or globally signed out. Both public domain forms open the production site; www canonicalises to the apex domain.

Final editor polish retains consent checkboxes on validation failure, allows owners to maintain an unchanged historical start date and removes an owned photograph only after its replacement/removal is saved successfully. New events still require a current/future date.

## External account work and launch gate

The personal Google account already has a verified ClassicsGo administrator profile. Vercel's existing account shows the personal email. Personal Google Cloud project `classicsgo` (44587218549) was created. Its branding wizard is prepared as ClassicsGo with the personal support/contact email and external audience, awaiting the user's Google policy acceptance. The existing live OAuth client remains active; its old project is inaccessible to the personal Google account. Client creation, secret entry and provider cutover are not complete.

GitHub CLI is authenticated as matthewcoxall12. GitHub and Supabase browser account settings require user sign-in before recovery/contact emails can be verified or changed. No unrelated project, billing, Workspace subscription, nameserver or email DNS changes were made.

Do not begin outreach until the personal OAuth cutover and a complete publish-with-image browser journey pass. Chrome's ChatGPT extension currently blocks automated file selection because Allow access to file URLs is disabled; the user has been given the official enabling instructions. Upload signatures, ownership and database boundaries pass automated checks, but a successful browser upload/publication has not been claimed. Database integration tests provide strong boundary evidence but do not replace that journey. Paid billing is not enabled: Roadbook is accurately offered as invitation-only early access with no payment.

## Security advisor interpretation

Private operational tables intentionally have RLS with no public policy. The shared-plan RPC is intentionally a token-scoped SECURITY DEFINER function: raw trip-table guest grants are revoked, fields are enumerated, owner entitlement is checked, and negative-token/private-note tests pass. Supabase also flags disabled leaked-password checking; the app exposes Google sign-in, not password signup. Reassess before enabling password authentication. No claim of absolute security or perfect future readiness is made.

## Expansion implementation sequence

1. Keep public listings free; retain ownership, cancellation history, source provenance and reporting. Monitor abuse and storage growth; add orphan-image cleanup and stronger quotas when observed use justifies it.
2. Add an authenticated organiser ownership/claim workflow before granting edit access to imported events. Claiming must never follow a supplied email alone.
3. Before selling Roadbook, integrate a payment provider with signed webhook handling, idempotent entitlement updates, cancellation/refund terms and failed-payment/expiry tests. Never trust browser payment success or editable metadata for membership.
4. Local partnerships remain expressions of interest only. Before selling placements, build protected partner records, verified business ownership, explicit region/category/date inventory, approval and expiry, conspicuous sponsorship labels, reporting, and signed payment webhooks. Keep commercial placement separate from event verification and organic relevance. Do not sell attendance identities or private trip data.
5. Add optional alerts only after consent, unsubscribe, reliable scheduling, verified sender and delivery controls exist. Claims must follow released functionality.
6. Measure regional coverage, freshness, duplicates, cancelled links, search failures and publishing completion before increasing discovery volume or beginning broad promotion. Thousands of stale or duplicate events are not a launch success metric.

## Image generation

Output: public/images/editorial/weekend-meet-v2.webp, 1600×800. Generated documentary-style imagined autumn village-hall classic-car gathering, weathered pale-blue Austin A35 van, red Mini, cream Morris Minor, green MG Midget with bonnet open, ordinary owners chatting over tea; informal composition, no prestige styling, text, captions or watermarks. Original generated PNG retained in the user's generated_images folder. This is illustrative, never represented as a real listed event.
