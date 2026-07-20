# Roadbook Member billing setup

Roadbook Member uses Stripe-hosted Checkout for new subscriptions and Stripe's
hosted Customer Portal for billing changes and cancellation. All prices are
configured as Stripe Price IDs; no secret or price is embedded in application
code.

## 1. Create the Stripe product and recurring prices

Create one product named **Roadbook Member** and attach these GBP recurring
prices:

| Plan | Amount | Interval | Environment variable |
| --- | ---: | --- | --- |
| Monthly | £2.99 | Monthly | `STRIPE_PRICE_MONTHLY` |
| Annual | £24.99 | Yearly | `STRIPE_PRICE_ANNUAL` |
| Founding annual (optional) | £19.99 first year, then £24.99 | Yearly | Annual Price plus `STRIPE_FOUNDING_COUPON_ID` |

Copy each `price_...` identifier into the matching runtime binding. For the
founding offer, create a **£5 off** Stripe Coupon with `duration=once` and put its
`coupon_...` identifier in `STRIPE_FOUNDING_COUPON_ID`. Checkout applies that
coupon to the standard annual Price, so the first invoice is £19.99 and renewal
returns to £24.99. Leave the coupon binding unset when the offer is unavailable.
A request for an unconfigured founding plan returns a clear 503
`BILLING_SETUP_PENDING` response.

Stripe Checkout's subscription mode accepts recurring Price IDs as line items:
<https://docs.stripe.com/api/checkout/sessions/create>

## 2. Configure server-only runtime bindings

Set these bindings in the production environment:

```dotenv
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
STRIPE_FOUNDING_COUPON_ID=coupon_... # optional, £5 off once
SITE_URL=https://classicsgo.com
```

Use test-mode values locally. Never expose the secret key or webhook signing
secret through a `NEXT_PUBLIC_` variable. If required configuration is absent,
the billing endpoints return HTTP 503 with code `BILLING_SETUP_PENDING`; builds
do not require Stripe credentials.

## 3. Configure the Customer Portal

Activate the Stripe Customer Portal in the Dashboard and enable the features
you want members to control, normally:

- payment-method updates;
- invoice-history access;
- switching between the monthly and annual Roadbook prices;
- cancellation at the end of the current billing period.

The portal endpoint creates a short-lived session for the authenticated Stripe
Customer and returns the member to `/account`. Stripe's portal session contract
is documented at <https://docs.stripe.com/api/customer_portal/sessions/create>.

## 4. Register the webhook

Create a Stripe webhook endpoint pointing to:

```text
https://classicsgo.com/api/billing/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`

Copy that endpoint's `whsec_...` secret into `STRIPE_WEBHOOK_SECRET`. Stripe
recommends using subscription webhooks because subscription state changes
asynchronously: <https://docs.stripe.com/billing/subscriptions/webhooks>.

The route verifies `Stripe-Signature` against the exact raw request body using
HMAC-SHA-256 and a five-minute timestamp tolerance before parsing JSON. Stripe's
signature troubleshooting guide emphasizes preserving the raw body:
<https://docs.stripe.com/webhooks/signature>.

Repeated and out-of-order deliveries are safe: a webhook ledger deduplicates
Stripe event IDs, while each subscription event is reconciled against the
current Stripe subscription before per-subscription state is saved. The app
then derives access across every current subscription for the member. `active`
and `trialing` grant Roadbook access. `past_due` grants a seven-day retry grace
period from the stored period end; other statuses return the member to the free
tier. The account warns a `past_due` member and links directly to Stripe's
Customer Portal for payment updates.

Stripe webhooks are update-only: they can attach billing state to an existing
verified member, but they never create a member record. Account deletion also
has a database-level guard against a live subscription or genuinely open
Checkout reservation. These two invariants make concurrent and delayed Stripe
events unable to recreate a deleted account or silently discard a new billing
relationship.

## 5. Monitor customer-erasure jobs

Confirmed account deletion first expires a known open Checkout Session. It asks
the member to retry briefly while a Checkout creation lease is genuinely in
flight, and it still refuses deletion for a live subscription or a Checkout
that completed concurrently. Once billing is safe to remove, the request queues
the customer-only Stripe profile for deletion in
`stripe_customer_deletion_jobs` in the same D1 transaction as the local account
erasure. The Worker attempts the Stripe deletion after the response and on the
15-minute maintenance schedule. A compare-and-set lease prevents concurrent
workers from making duplicate calls; transient failures back off for at most 12
attempts. The raw Stripe customer ID is cleared when deletion succeeds, while a
minimal HMAC reference and completion record are retained for 365 days.

Alert on any row whose `status = 'attention'`. That state means Stripe rejected
the request permanently or the bounded retry budget was exhausted. After the
credential/provider issue is resolved, an operator can deliberately requeue a
reviewed job by setting `status = 'pending'`, `attempts = 0`,
`next_attempt_at` to the current Unix time, and `attention_at = NULL`. Never
copy customer IDs or API error bodies into public logs. Resolve attention jobs
within 90 days: scheduled maintenance irreversibly clears the raw customer ID
after that operator-recovery window and keeps only the HMAC reference, status
and sanitized error code.

## Endpoint contracts

### `POST /api/billing/checkout`

Requires a verified member session and same-origin CSRF token. JSON body:

```json
{ "plan": "monthly" }
```

`plan` can be `monthly`, `annual`, or `founding`. Success returns the standard
API envelope:

```json
{ "ok": true, "data": { "url": "https://checkout.stripe.com/...", "sessionId": "cs_..." } }
```

The client should navigate to `url`. Important errors include:

- `401 AUTH_REQUIRED`
- `400 INVALID_PLAN`
- `409 ALREADY_SUBSCRIBED`
- `409 MEMBERSHIP_CONFIRMING` after Checkout while Stripe membership state is still syncing
- `409 FOUNDING_OFFER_UNAVAILABLE` for a previous Stripe subscriber
- `409 CHECKOUT_IN_PROGRESS` while another checkout reservation is being created
- `503 BILLING_SETUP_PENDING`

Only one usable Checkout Session is kept per member. Repeated requests for the
same plan reuse it; changing plans first expires the earlier Stripe session.

### `POST /api/billing/portal`

Requires a verified member session and same-origin CSRF token. No body is required. Success returns:

```json
{ "ok": true, "data": { "url": "https://billing.stripe.com/...", "sessionId": "bps_..." } }
```

The client should navigate to `url`. A member who has never begun Checkout gets
`409 NO_BILLING_PROFILE`; missing configuration gets
`503 BILLING_SETUP_PENDING`.

### `POST /api/billing/webhook`

Accepts Stripe's raw request and `Stripe-Signature` header. A valid supported
event returns `{ "received": true, "handled": true }`; unrelated valid events
return `handled: false`. Invalid signatures return 400 so they are never
processed. Transient database or Stripe API failures return a non-2xx status so
Stripe can retry the event.

## Local webhook test

With test-mode values loaded, use the Stripe CLI to forward events:

```bash
stripe listen --forward-to http://localhost:5173/api/billing/webhook
```

Use the signing secret printed by that command for the local
`STRIPE_WEBHOOK_SECRET`; it differs from the Dashboard endpoint secret. Then
complete a Checkout with a Stripe test card and confirm that `/api/member`
reports `tier: "roadbook"` and the expected subscription status.
