# Roadbook billing operations

Paid checkout stays disabled until the complete payment flow is verified. On 10 October 2026 Stripe's Account status showed Payments and Payouts Active for ClassicsGo (`acct_1UOy6SBKvYr7hh3N`, teammakeit3d@gmail.com). No live charge or payout change was made. Live credentials, webhooks, portal and invoice terms are configured, and genuine test-mode checkout/lifecycle checks passed. Browser photograph upload/persistence/removal passed. A manually resent Stripe TEST refund receipt arrived in the owner inbox with receipt and full contract invoice PDFs, authenticated SPF/DKIM/DMARC. Automatic first-payment receipt delivery has not been separately exercised. Remaining external launch checks are Google branding and welcome-sender DNS. Earlier onboarding notes below are historical.

## Current live setup — 10 October 2026

- Product `prod_VPtCxez6IvhlDv`, ClassicsGo Roadbook.
- Annual price `price_1UP3QXBKvYr7hh3NgOc8MEXr`: GBP 1500/year, tax-inclusive.
- Monthly price `price_1UP3RSBKvYr7hh3NW9TMBEVU`: GBP 200/month, tax-inclusive.
- Customer portal `bpc_1UP3T4BKvYr7hh3NH5auuSHw`: invoice history, payment-method changes and period-end cancellation enabled; arbitrary plan switching disabled; return URL https://classicsgo.com/membership.
- Public support email matthewcoxall@googlemail.com, support URL https://classicsgo.com/contact, Terms and Privacy URLs saved. Statement descriptor CLASSICSGO.
- Owner-authorised public contact address: 48 Furzedale Park, Hythe, SO45 3HW, United Kingdom.
- Vercel production has the two live price IDs, a sensitive server-only restricted key, the sensitive webhook signing secret and `BILLING_ENABLED=false`. The deployment was rebuilt with these settings. Unsigned webhook requests return HTTP 400, Invalid signature.
- Owner approved connecting live/test keys and billing webhooks and completed Stripe email/authenticator verification. The live key's five permissions are Customers write, Checkout Sessions write, Customer Portal write, Prices read and Subscriptions read.
- Live webhook `we_1UP3emBKvYr7hh3NhBbEMLoX` is active at https://classicsgo.com/api/billing/webhook, snapshot API version 2026-09-30.endive, listening to the eleven lifecycle events below.
- Successful-payment and refund receipts are enabled. Upcoming-renewal, expiring-card and failed-payment emails are enabled with Stripe-hosted payment-update and customer-portal links. Required-payment-confirmation emails are enabled.
- Invoice PDFs/attachments are enabled. The default memo explains renewal and contact; the default footer retains dated Roadbook purchase terms, operator/address, price/interval, membership benefits, cancellation and the first-payment refund procedure. Saving these defaults does not prove actual delivery.
- A preview-only test setup was created, then its credentials, prices, mode and allowlist were removed after testing. Test webhook `we_1UP3jpBKvYr7hh3Nn5a7l2gh` is disabled because Vercel SSO blocks unauthenticated provider delivery. Project-wide protection was not disabled. Authentic provider-event delivery was verified locally using the official Stripe CLI.
- Supabase welcome function version 5 is active with conservative retry handling. Sender DNS and sending credentials remain pending; welcome delivery is disabled.

The configuration above is supplemented by the completed test purchases below. Keep checkout disabled until the remaining launch checks are complete.

## Provider test evidence — 10 October 2026

Testing used a dedicated disposable auth account, Stripe test mode, a local application on port 3004 and the official Stripe CLI forwarding authentic signed events. No real member or real card was used. Vercel deployment protection remains enabled.

- Annual app checkout `cs_test_a1cFYfeY6hefxxOJbWxYYgpzk1h81yOc1OAmjgVK4bmJUMnZvS09nR0GYK` completed in browser for GBP 1500. Subscription `sub_1UP3qQBKvYr7hh3NDR8ZEuXH`; paid invoice `in_1UP3qOBKvYr7hh3NM2Ge8Hu5`.
- Authentic checkout, invoice-paid and subscription-created events returned HTTP 200 and granted Roadbook through 10 October 2027. Example IDs: `evt_1UP3qSBKvYr7hh3Nql0zecOm`, `evt_1UP3qSBKvYr7hh3NrJKmcOjc`, `evt_1UP3qSBKvYr7hh3NGC0RaEY8`.
- Period-end cancellation retained access and the hosted ClassicsGo test portal displayed the correct 10 October 2027 service end. Immediate cancellation removed access. Original event replay returned 200 without regranting; tampered and unsigned requests returned 400.
- Monthly app checkout completed in browser for GBP 200. Subscription `sub_1UP3t2BKvYr7hh3NgDOgpSFP`; paid invoice `in_1UP3t0BKvYr7hh3NadCFBUQq`; Roadbook activated through 10 November 2026.
- An official decline-after-attachment test payment method caused a genuine failed renewal: `invoice.payment_failed` event `evt_1UP3v4BKvYr7hh3NtSyOgzRB`, invoice `in_1UP3v0BKvYr7hh3NWBt4dvTa`. Canonical subscription status became `past_due` and premium access was removed.
- Both invoices retained the complete 3210-character purchase-terms footer and 266-character memo. No customer email delivery is claimed: the disposable email is a reserved example-domain address.
- Missing authentication returned 401; cross-origin checkout returned 403; retry reused the unpaid checkout; a forged success query left the account free; the authenticated customer portal returned the correct Stripe session.

The provider rejected the first checkout because Managed Payments was enabled by the test account's defaults. Checkout now explicitly sets `managed_payments[enabled]=false` to use ClassicsGo's direct Stripe billing, with a regression test. No account-wide Managed Payments or tax settings were changed.

Cleanup completed: both test subscriptions cancelled, failed invoice voided, both test payments refunded, test customer and dedicated auth account deleted, no open Checkout sessions or active test subscriptions left for that customer. Local app/listener processes stopped; remote preview credentials removed. Automatic tool approval rejected deletion of ten local temporary credential/session JSON files without a stated reason; these remain in the owner-only classicsgo-billing-setup temp directory and require local cleanup. Production credentials and its active webhook remain configured, with checkout disabled. Recreate an isolated test environment for future provider testing rather than reusing these deleted fixtures. Hosted preview delivery and actual receipt-email delivery were not certified by the local tests.

Sanitized provider evidence is retained in the workspace artifacts as billing-provider-verification-2026-10-10.json and .md. Lint, TypeScript, all 58 automated tests and the production build passed after the direct-billing correction.

## Configuration and launch reference

1. Complete the new ClassicsGo account merchant identity, bank/payout and Stripe onboarding requirements. Do not use an unrelated GPBox or Vroova merchant.
2. Create two active live recurring GBP prices with licensed quantity one and tax behaviour explicitly inclusive: annual 1500 pence every year and monthly 200 pence every month. The website verifies these exact amounts, tax behaviour and intervals against Stripe before starting checkout. Exclusive or unspecified tax prices are rejected so that later tax configuration cannot add charges above the advertised consumer price. Annual saves £9 against twelve monthly payments.
3. Configure Vercel server-only STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_ROADBOOK_ANNUAL_PRICE_ID and STRIPE_ROADBOOK_MONTHLY_PRICE_ID. SUPABASE_SECRET_KEY or existing SUPABASE_SERVICE_ROLE_KEY is needed for protected billing RPCs. Never expose secrets with NEXT_PUBLIC. Leave BILLING_ENABLED=false until all checks are complete.

   `STRIPE_SECRET_KEY` supports either a server secret (`sk_live_` / `sk_test_`) or a scoped restricted key (`rk_live_` / `rk_test_`); live and test keys remain strictly separated. Prefer a restricted key granting Customers write, Checkout Sessions write (including expiry), Subscriptions read, Prices read and Billing Portal Sessions write. A syntactically matching key alone does not prove its permissions: verify Checkout, canonical subscription retrieval and portal creation in the dedicated sandbox before enabling billing. The separate webhook signing secret is still required.
4. Migration 20261010105617_stripe_billing_lifecycle.sql was applied on 10 October 2026. tests/billing-lifecycle.sql passes with synthetic database fixtures rolled back; it makes no Stripe calls.
5. Register https://classicsgo.com/api/billing/webhook with API version 2026-09-30.endive. Subscribe to checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, customer.subscription.paused, customer.subscription.resumed, invoice.paid, invoice.payment_failed and invoice.payment_action_required. Copy that endpoint signing secret into server configuration.
6. Configure the Stripe customer portal for payment methods, invoices and cancellation at the end of the paid period. Disable arbitrary product/plan switching in the portal until supported and verified. Configure business details and Terms URL https://classicsgo.com/terms because Checkout collects terms consent. Review Stripe receipt, retry and cancellation email settings.
7. Verify the complete flow in a separately configured Stripe sandbox before enabling live billing: paid subscription grants access only after authenticated webhook; cancel-at-period-end keeps access through expiry; failed or terminal subscription removes access; replay/out-of-order webhook cannot grant incorrectly; portal only opens the authenticated user's customer. Production always requires live keys and live events and rejects BILLING_MODE=test. In a Vercel preview set BILLING_MODE=test, VERCEL_ENV=preview, the sandbox sk_test_ key, sandbox whsec_ secret, sandbox annual/monthly Price IDs, and BILLING_TEST_USER_ID to a dedicated disposable test account UUID. Preview return URLs and Origin checks use the validated HTTPS VERCEL_URL ending .vercel.app. For local development set VERCEL_ENV=development and BILLING_TEST_SITE_URL=http://localhost:3000. The UI clearly labels test checkout with no real charge. The existing app shares its production database, so test checkout/portal and signed sandbox webhooks are restricted to that one dedicated test account customer; never use a real member/owner as the test account. Sandbox payments may grant this disposable account test entitlements in the shared database and require support cleanup afterwards. No credentials or test payment were entered by this implementation. Do not use fake live payments as a substitute for sandbox verification. Unit and SQL tests do not certify payment-provider configuration. Do not enable BILLING_ENABLED until the owner has completed and verified this setup.

## Safety and lifecycle

The Checkout success URL never grants membership. Webhooks verify raw-body HMAC signatures and freshness, retrieve canonical Stripe subscription state, and apply a service-only RPC with idempotency and stale-event protection. Ordinary clients cannot write billing tables or profile entitlement columns. Existing administrator and manually granted early access are preserved and never silently converted into paid subscriptions.

Checkout reserves a per-customer lease across Stripe calls and uses a stable generation idempotency key independent of annual/monthly selection. A known unpaid previous checkout must expire before changing plan. Ambiguous network failures retain the generation to prevent a second subscription. A customer mapping blocks self-service account deletion, even when no subscription exists yet. Support must expire all open Checkouts, resolve/cancel billing and confirm no further charges can occur before manually completing a deletion. Never simply remove the mapping to bypass this guard. Customer binding and deletion share an advisory transaction lock.

Subscription cancellation stops renewal; access ends at the paid period boundary. Refunds and disputes require Matthew's review in Stripe; no automatic refund API is implemented. Inspect and reconcile refunds against subscription/access state rather than assuming a refund cancels the subscription. Retain retired price IDs in STRIPE_ROADBOOK_LEGACY_PRICE_IDS while existing subscriptions use them. Disabling new checkout does not disable the billing portal or webhook lifecycle when server credentials remain configured.

## Optional welcome email

Sign-in works without welcome delivery. Supabase still needs RESEND_API_KEY and WELCOME_EMAIL_FROM with the Resend-verified sender ClassicsGo <welcome@mail.classicsgo.com>. The mail.classicsgo.com domain has been created in Resend; its two CNAME records and DKIM TXT record await Squarespace owner access. A paid Google Workspace mailbox is not required for sender-domain DNS verification. Replies use matthewcoxall@googlemail.com; Gmail/Googlemail must not be used as the Resend From address. No welcome email was sent during this work.

## 10 October follow-up: sandbox catalogue and customer cancellation

The account test mode `acct_1UOy6SBKvYr7hh3N` contains product `prod_VPq5g5b02kpI5W` (ClassicsGo Roadbook). These are TEST prices only; never configure them for production:

- Annual: `price_1UP0PTBKvYr7hh3NOhI5xce2` — GBP 1500/year, tax-inclusive.
- Monthly: `price_1UP0QnBKvYr7hh3NvBIWSll9` — GBP 200/month, tax-inclusive; lookup key `classicsgo_roadbook_monthly_gbp_v1`.

This is the live account's existing test mode, distinct from the separate `acct_1UOy6cAwhU3FQneZ` sandbox. Keys, products and webhooks must all belong to the same selected test environment. Nothing has been charged, and neither secret was read or copied.

The public Terms now give a full first-payment refund when cancellation is requested within 14 days, even after use. This is deliberately distinct from portal cancellation at period end. Process requests manually in Stripe, stop renewal, reconcile entitlement and refund through the original payment method within 14 days. No automatic refund API or automatic email delivery is claimed. Before enabling paid membership, publish the owner's confirmed business/contact postal address and verify the contractual details are available to customers in a durable form.

Google branding still displays the old ownership issue and explicitly requires waiting 24 hours after Search Console verification. Earliest planned retry: 11 October 2026 at approximately 11:22 UTC / 12:22 UK time. Personal Google login itself passed earlier.

Test customer portal default configuration `bpc_1UP0SmBKvYr7hh3NFdwQh5E3` was saved with a ClassicsGo Roadbook header and return URL https://classicsgo.com/membership. Invoice history, payment-method updates and period-end cancellation are enabled; arbitrary plan/quantity switching stays off. Public business policy links remain blocked by incomplete merchant activation. This is configuration evidence, not a completed member portal journey.

Owner-requested onboarding corrections were saved and re-opened to verify: category Software as a service; ClassicsGo event-discovery/Roadbook description with £15/year and £2/month; full and shortened bank-statement descriptors CLASSICSGO. The business website already matches https://classicsgo.com. No revenue forecast was invented (I don't know yet), no VAT number was supplied, and no legal identity or bank fields were changed. Activation is open at Review and submit with Add bank account outstanding. The owner must add bank details and perform final Agree and submit. No financial activation or live capability is claimed. Shared legal entity warning remains visible on profile steps; the owner's explicit request authorised the category/description correction, not changing legal identity.

A later browser check reached Home – ClassicsGo – Stripe and displayed 'You’re now in your live account'. The activation form was no longer open. This records dashboard progress only: live payment capabilities, webhook delivery and end-to-end checkout have not yet been verified.

## Purchase confirmation and final launch evidence

Before switching on live checkout, verify a dedicated sandbox member receives a durable purchase confirmation they can keep. A return to the website and an editable Terms page alone are not evidence of this. Configure and test Stripe's invoice/receipt delivery and retain the applicable membership terms with the confirmation: ClassicsGo operator/contact details, the owner's confirmed public postal address, the purchased plan and total inclusive price, automatic-renewal interval, period-end cancellation route and the first-payment 14-day refund procedure. Stripe's tax and Managed Payments settings must be reviewed individually; importing them from a different merchant or sandbox is not required for Roadbook.

Record the sandbox checkout session, subscription and delivered webhook event IDs (never keys/card details), confirmation delivery, granted entitlement, duplicate-event result, period-end cancellation, expiry/failure removal and customer-isolated portal checks. Live configuration needs a separate check that price IDs, key, endpoint and signing secret belong to the ClassicsGo live account. Keep `BILLING_ENABLED=false` until these checks and public contact details are complete. Turning new checkout off must continue to leave existing members' portal and signed webhook lifecycle available.
