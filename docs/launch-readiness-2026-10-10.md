# ClassicsGo launch audit — 10 October 2026

## Implemented and checked

- Immediate signed-in member publication, full event details, official/booking links and optional owned image upload. Owners edit, cancel and restore listings.
- Database ownership, unverified community defaults, protected source/attendance fields, UK postcode/coordinates/date/time/URL validation, daily publishing and upload limits.
- Cancelled public URLs remain useful with a clear notice; cancelled events leave search results and cannot receive new attendance/saves through the website.
- Free attendance; premium-only private wishlist; private trip ordering/notes; optional revocable token sharing; authenticated all-day calendar export.
- Sharing returns explicitly selected public fields, never private notes, owner IDs or raw private tables. Expired entitlements cannot save or share.
- Google button remount, network failure recovery, safe return destinations, live-session checks for sensitive account controls and no email-based automatic administrator grants.
- Search filters run before pagination, including local searches beyond the former 200-row cap. Stable ordering, ongoing events and London calendar dates are covered.
- Personal public/contact/operational email: matthewcoxall@googlemail.com. The latest draft homepage illustration uses four cars at a consistent scale—Austin A35 van, Mini, Morris Minor and MG roadster—in a busier informal meet. No image captions; attribution and illustration disclosure remain on the credits page.
- Member reviews support one public review per account/event after the final event day in UK time, editing/deletion, ratings, stable pagination and reporting. Database ownership, protected reviewer fields and persistent writing quotas are enforced. Reviews are opinions; attendance is not independently verified.

## Evidence

The latest release passed lint, TypeScript, all 49 unit tests and a production build. Eight rollback-only database suites now cover session security, administrator defaults, publishing, premium/privacy/attendance, search, caller-only export/deletion, member reviews and billing lifecycle. The new review and billing suites passed against the live database with all synthetic changes rolled back. Desktop and 390px mobile homepage checks from the main audit passed; the replacement meet image and completed-event review section also rendered correctly in the latest local preview.

The main audit database migrations were applied to rnayhhsurmztrohtftqo, including repaired caller-only account RPCs with recent/live-session checks and caller-owned published events in exports. The member-review migration is also applied; its rollback-only integration suite passed, including privacy boundaries, account export coverage and cleanup of synthetic records. Welcome function v4 was deployed with JWT verification retained. Transactional welcome delivery remains disabled pending verified sender DNS and credentials; login does not depend on it. Personal Reply-To is prepared.

Production browser checks passed personal Google redirect sign-in, attendance and wishlist persistence after reload, private Roadbook notes, optional public sharing without private notes, revoked-link 404, an actual calendar download, event-editor URL rejection with retained input, and saving edits to a cancelled listing without publishing it. Account export initially exposed the missing RPC and now reports a successful download after repair. Temporary trips, attendance, wishlist and cancelled listing fixtures were removed. No real account was deleted or globally signed out. Both public domain forms open the production site; www canonicalises to the apex domain.

Final editor polish retains consent checkboxes on validation failure, allows owners to maintain an unchanged historical start date and removes an owned photograph only after its replacement/removal is saved successfully. New events still require a current/future date.

## External account work and launch gate

The personal Google account has a verified ClassicsGo administrator profile. Vercel's existing account shows the personal email. Personal Google Cloud project `classicsgo` (44587218549) now has accepted Google policy terms and a production OAuth client using only the three basic identity scopes. The client secret has not been entered into Supabase and the provider cutover remains pending; the existing live OAuth client remains active. Branding verification failed because domain ownership is not yet established in Search Console. Root added the Search Console HTML verification tag to the draft layout; ownership verification has not been claimed.

GitHub CLI is authenticated as matthewcoxall12; the personal primary email is verified. The Supabase account's personal email is verified too. Resend is signed into the personal account and the transactional sender domain `mail.classicsgo.com` has been created. Its DNS records await Squarespace owner verification, which currently points to the old Workspace identity the user is retiring. No completed sender verification or delivery is claimed. Nameservers and existing email DNS have not been changed as part of this audit.

The user created a new ClassicsGo Stripe account, `acct_1UOy6SBKvYr7hh3N`, using teammakeit3d@gmail.com. It remains in test onboarding and has not been activated; the tax/dispute management choice is left to the owner. The selected plans are £15 annually or £2 monthly. Billing code passed independent review, unit checks and its live rollback database suite, and its migration is applied. Checkout remains disabled: no end-to-end payment, production checkout, webhook delivery or billing-portal journey is claimed. While disabled, Roadbook remains invitation-only early access without payment. Signed webhooks, server-only entitlement writes, stable checkout generations and account-deletion guards are implemented; these do not replace provider setup and end-to-end testing.

Do not begin outreach until personal OAuth cutover and a complete publish-with-image browser journey pass. Browser file-access permission remains pending; the user has been given the extension's enabling instructions. Upload signatures, ownership and database boundaries have automated coverage, but successful browser upload/publication has not been claimed. Complete Search Console ownership/branding and transactional sender verification before relying on professional login branding or welcome delivery. Paid promotion of Roadbook additionally requires activated Stripe billing and successful end-to-end billing checks.

## Security advisor interpretation

Private operational tables intentionally have RLS with no public policy. The shared-plan RPC is intentionally a token-scoped SECURITY DEFINER function: raw trip-table guest grants are revoked, fields are enumerated, owner entitlement is checked, and negative-token/private-note tests pass. Supabase also flags disabled leaked-password checking; the app exposes Google sign-in, not password signup. Reassess before enabling password authentication. No claim of absolute security or perfect future readiness is made.

## Expansion implementation sequence

1. Keep public listings free; retain ownership, cancellation history, source provenance and reporting. Monitor abuse and storage growth; add orphan-image cleanup and stronger quotas when observed use justifies it.
2. Add an authenticated organiser ownership/claim workflow before granting edit access to imported events. Claiming must never follow a supplied email alone.
3. Before selling Roadbook, finish the reviewed Stripe integration and provider activation, verify £15 annual/£2 monthly prices, signed webhook delivery, idempotent entitlement updates, checkout concurrency, plan switching, cancellation/refund terms, failed-payment/expiry behavior and safe account-deletion cleanup. Never trust browser payment success or editable metadata for membership.
4. Local partnerships remain expressions of interest only. Before selling placements, build protected partner records, verified business ownership, explicit region/category/date inventory, approval and expiry, conspicuous sponsorship labels, reporting, and signed payment webhooks. Keep commercial placement separate from event verification and organic relevance. Do not sell attendance identities or private trip data.
5. Add optional alerts only after consent, unsubscribe, reliable scheduling, verified sender and delivery controls exist. Claims must follow released functionality.
6. Measure regional coverage, freshness, duplicates, cancelled links, search failures and publishing completion before increasing discovery volume or beginning broad promotion. Thousands of stale or duplicate events are not a launch success metric.

## Image generation

Latest draft output: public/images/editorial/weekend-meet-v3.webp. Generated documentary-style imagined village-hall classic-car gathering with a weathered Austin A35 van, Mini, Morris Minor and MG roadster at a consistent scale, surrounded by a busier group of ordinary owners. Informal composition, no prestige styling, text, captions or watermarks. Illustration disclosure remains on the photography credits page. This is illustrative, never represented as a photograph of a listed event. No latest deployment claim is made here.
