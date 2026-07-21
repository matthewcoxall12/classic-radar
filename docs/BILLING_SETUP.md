# Stripe billing setup

Paid membership is deferred for the Google-only beta. Keep checkout, portal and
paid entitlements disabled until this checklist is complete.

## Before provider configuration

- Define the Supabase migration for billing customers, subscriptions, checkout
  attempts and webhook idempotency if it is not already present.
- Ensure account deletion blocks while a live subscription or checkout requires
  reconciliation.
- Test billing routes without secrets and confirm they fail closed without
  rendering active purchase controls.
- Publish accurate price, renewal, cancellation, refund and consumer-rights
  wording.

## Stripe objects

Create the live ClassicsGo product and recurring GBP monthly/annual prices in
the owner's Stripe account. Record Price IDs, not dashboard URLs. If a founding
offer is used, create a bounded Stripe Coupon and document eligibility and
duration.

Configure a live webhook endpoint:

```text
https://classicsgo.com/api/billing/webhook
```

Subscribe only to events the implementation handles. At minimum, cover checkout
completion/expiry and subscription creation, update and deletion. Verify Stripe
signatures against the raw request body and make every event idempotent.

## Vercel environment

Store these as encrypted server-only production values:

```dotenv
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
STRIPE_FOUNDING_COUPON_ID=coupon_... # optional
```

Never prefix a Stripe secret with `NEXT_PUBLIC_`. Preview deployments should use
test-mode values and must not receive live webhook events.

## Acceptance

Test with a disposable member:

1. Start and abandon checkout; confirm the local attempt expires safely.
2. Complete monthly checkout and confirm exactly one customer/subscription.
3. Open the Customer Portal and change/cancel the subscription.
4. Replay webhook events and confirm no duplicate entitlement or charge state.
5. Simulate delayed/out-of-order events and confirm the newest provider state
   wins safely.
6. Confirm paid entitlements disappear at the documented time.
7. Confirm account deletion is blocked while billing is active and succeeds
   after provider reconciliation.
8. Confirm logs contain event IDs and safe error codes, never card data or full
   webhook bodies.

Add webhook failure and reconciliation checks to the monitoring runbook before
enabling paid controls. Stripe dashboard completion alone does not make billing
production ready.
