# Production launch checklist

DNS is the last cutover step. Complete and evidence every required gate against
the Vercel release candidate first.

## Release candidate

- [x] Preserve the approved Sites-v13 interface and assets with the parity test.
- [x] Use Next.js on Vercel and Supabase for identity/application data.
- [x] Pin CI/local Node to `24.14.0` and Vercel to the supported `24.x` line.
- [x] Install dependencies from `package-lock.json` with `npm ci`.
- [x] Run lint, type-check, the complete test suite and the production build in
  GitHub Actions.
- [x] Fail CI on moderate-or-higher production dependency findings.
- [x] Provide scheduled health monitoring and a no-cost incident runbook.
- [ ] Review and merge PR #9 through the normal protected-branch process.
- [ ] Confirm the merged commit has successful GitHub and Vercel checks.
- [ ] Promote that exact tested commit to Vercel production.

## Required for a Google-only public beta

- [ ] Add a valid production `AUTH_HASH_PEPPER`; prove town/postcode search no
  longer returns `503`.
- [ ] Configure the server-only Supabase secret and test reauthentication,
  session revocation, account export and deletion end to end.
- [ ] Confirm Google sign-in with the Workspace owner and an unrelated consumer
  account; verify logout and callback errors.
- [ ] Confirm Supabase RLS/security advisors are clean and all required
  migrations/Functions match the release commit.
- [ ] Review enough current events to make the public search useful. Investigate
  partial discovery runs and recurring source errors; do not auto-publish the
  review queue.
- [ ] Confirm `/api/health`, `/`, `/sign-in` and the public events API pass on
  the production deployment.
- [ ] Enable GitHub Actions failure notifications for the repository owner and
  perform one test incident using `docs/MONITORING_RUNBOOK.md`.
- [ ] Publish accurate operator identity, service address and privacy/support
  contacts; complete the UK privacy/ICO assessment.
- [ ] Confirm registrar MFA, domain lock, renewal, Workspace MX/SPF/DKIM/DMARC
  and inbound role-address delivery.
- [ ] Complete mobile, keyboard, accessibility and real-browser acceptance.

## Features that may remain deferred

These do not block a deliberately labelled Google-only beta when their controls
and UI stay disabled:

- [ ] Email/password login, custom SMTP and welcome email
- [ ] Public event/partner/privacy forms and Turnstile
- [ ] Stripe products, webhook, portal and paid membership

Do not show enabled controls for a deferred provider. Every server route must
also fail closed; hiding a button is not a security boundary.

## Cutover

1. Freeze release changes and record the approved commit SHA.
2. Confirm CI, Vercel build, Supabase migration/Function versions and preview
   acceptance against that SHA.
3. Deploy the approved commit to Vercel production without changing DNS.
4. Use the Vercel deployment URL to run health, search, Google auth and account
   lifecycle smoke tests.
5. Record the immediately previous known-good Vercel deployment for rollback.
6. Change only the required apex/`www` DNS records; preserve Google Workspace
   mail and domain-verification records.
7. Wait for Vercel to show both domains and managed TLS as valid.
8. Run the post-cutover checks below from an unrelated connection.

## Post-cutover acceptance

- [ ] Apex HTTPS loads the ClassicsGo landing page with no hosting gate.
- [ ] `www` resolves to the intended canonical host.
- [ ] Security headers, robots and sitemap are correct.
- [ ] Location and event search return useful results.
- [ ] Google sign-in, account page, logout and reauthentication work.
- [ ] `/api/health` returns `200` without revealing configuration values.
- [ ] Vercel runtime errors and GitHub uptime monitor are clean.
- [ ] Supabase Auth, database and Function logs show no unexplained failures.

If a critical check fails, stop promotion or roll back the Vercel deployment.
DNS changes are not a substitute for a tested production deployment.
