import type { Metadata } from "next";
import Link from "next/link";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Privacy notice | ClassicsGo",
  description: "How ClassicsGo handles event submissions, partnership enquiries, location searches and saved events.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <SecondaryPageShell
      eyebrow="Privacy"
      title="Your details stay behind the scenes"
      intro="This plain-language notice explains what ClassicsGo collects, why it is needed and the choices available to you."
      note="Last updated 19 July 2026"
    >
      <section className="privacy-section">
        <div className="shell privacy-layout">
          <nav aria-label="Privacy notice contents">
            <a href="#information">Information we collect</a>
            <a href="#membership">Member accounts</a>
            <a href="#payments">Payments</a>
            <a href="#use">Purposes and lawful bases</a>
            <a href="#location">Location and saved events</a>
            <a href="#sharing">Calendars and sharing</a>
            <a href="#providers">Service providers</a>
            <a href="#cookies">Cookies and security</a>
            <a href="#retention">Retention and requests</a>
          </nav>
          <article className="privacy-copy">
            <p className="privacy-lead">
              ClassicsGo is operated by Matthew Coxall and is responsible for information submitted through this website. We do not sell personal information or publish organiser contact details on event cards. Privacy questions and rights requests can be sent to <a href={mailto(SITE_EMAILS.privacy)}>{SITE_EMAILS.privacy}</a> or through the dedicated privacy-request page.
            </p>

            <section id="information">
              <h2>Information we collect</h2>
              <p>When you submit an event, we store the organiser name, email address, optional club name and the event details you provide. When you register partnership interest, we store your name, email, organisation details, website where supplied and message. Privacy requests are stored separately with your name, email, request type and message. We also process limited security information, including pseudonymous rate-limit identifiers and the outcome of bot checks.</p>
              <p>Permitted organiser feeds, official pages, partner services and licensed sources may also supply normalized event facts, an organiser or club name, a public source URL and verification timestamps. We keep that limited provenance so operators and visitors can verify a listing. We do not collect attendee lists, private social-profile data, access credentials or raw social posts/pages through event discovery.</p>
            </section>

            <section id="membership">
              <h2>Member accounts</h2>
              <p>You can sign in with Google or, when the production email service is enabled, create an email-and-password account. Supabase verifies the identity, stores password verifiers and sends confirmation, recovery and security emails through the configured sender. ClassicsGo never receives your Google password and does not store or log plaintext email passwords; its server passes email credentials to Supabase over encrypted connections. The identity provider supplies a verified email address, provider identifier and optional display name. We store the linked identity, hashed session credentials, sign-in history, saved events, Going responses, home areas, vehicle and marque preferences, roadbooks, alert rules, notification history, digest preferences, membership tier and trial dates so the service can work securely across devices.</p>
            </section>

            <section id="payments">
              <h2>Payments</h2>
              <p>Roadbook Member payments are processed by Stripe. Stripe collects and processes payment-card details; ClassicsGo does not store complete card details. We store the Stripe customer and subscription references, membership status and renewal or expiry information needed to provide paid features. Stripe handles payment information under its <a href="https://stripe.com/gb/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</p>
            </section>

            <section id="use">
              <h2>Purposes and lawful bases</h2>
              <p>Account, planning and paid-membership data is used to provide the service you request and administer the contract with you. Submission, enquiry and privacy-request details are available only to authorised operators through a private review queue and are used to review genuine listings, answer messages, handle rights requests and operate the service. Queue changes are recorded for accountability. Security records, rate limits and bot checks support our legitimate interest in preventing fraud and abuse. Payment and privacy-request records may also be retained where necessary to meet legal obligations. Public event listings use the event information and official link, not private contact fields.</p>
              <p>We use limited sourced event facts and provenance in our legitimate interests to maintain a useful, accurate public directory, subject to source permissions and human review. If an organiser or club name identifies you, you can ask us to correct the listing or object through the privacy-request form; we will balance that request against the need to verify public event information.</p>
            </section>

            <section id="location">
              <h2>Location and saved events</h2>
              <p>If you allow browser location, the coordinates stay in your browser and are used there to calculate event distances; they are not added to your profile unless you explicitly save an area. Typed town, postcode and place searches are sent to the configured Nominatim-compatible location provider. The original query text is not kept in our cache; the service stores a one-way SHA-256 cache key with the returned place label and coordinates for up to 30 days. The provider still receives the text you submit, so do not enter confidential information. The default provider is covered by the <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">OpenStreetMap Foundation privacy policy</a>. Anonymous saved-event choices stay in your browser’s local storage; signed-in saves are also synced to your account. A verified signed-in member can mark an event as Going. Event cards show only the combined number of Going responses; attendee names, email addresses and account identifiers are not published.</p>
            </section>

            <section id="sharing">
              <h2>Calendars and sharing</h2>
              <p>A private calendar-feed link can expose the titles and dates of your saved events to anyone who has that link, so treat it like a password and regenerate it if it is shared accidentally. If you deliberately share a roadbook, its event plan and notes can be viewed through the share link; your email address is not included on the shared page.</p>
            </section>

            <section id="providers">
              <h2>Service providers and transfers</h2>
              <p>Vercel provides website delivery and server functions. Supabase provides database storage and managed identity; Google provides social sign-in, and a Nominatim-compatible provider handles typed location searches. Turnstile protects enabled public account forms. GitHub Actions schedules the event-discovery intake without a paid database scheduler. When discovery integrations are enabled, Firecrawl and approved event-platform APIs process public source URLs and limited event facts under reviewed source controls; raw pages are not retained in the event database. Stripe handles paid billing only after checkout is enabled. Some providers may process information outside the UK under their contractual transfer safeguards. Provider terms and transfer safeguards are reviewed as each service is activated; optional payment, email and discovery services remain fail-closed until their checks are complete.</p>
            </section>

            <section id="cookies">
              <h2>Cookies and security</h2>
              <p>We use necessary cookies for OAuth hand-off, secure Supabase sessions, cross-site request protection and enabled bot checks. The application does not currently set advertising or behavioural-analytics cookies. Session cookies are encrypted in transit, restricted to HTTPS and can be revoked through the account. Sensitive account actions require a recent verified sign-in.</p>
              <p>To report a suspected security problem privately, email <a href={mailto(SITE_EMAILS.security)}>{SITE_EMAILS.security}</a>. Do not include passwords, authentication codes or other people’s personal information.</p>
            </section>

            <section id="retention">
              <h2>Retention and requests</h2>
              <p>Account and planning data is kept while the account is active and is removed when an eligible free account is deleted. One-way keyed email and sign-in-identity markers may be retained for up to three years after deletion to prevent repeated trial use and stop a stale provider identity from recreating the deleted account; they cannot be used to send email or restore account data. Where managed-identity removal is required, the provider identifier is held in a retry record for no more than 30 days and is then removed, including when manual provider recovery was unsuccessful. Contact details are kept only while needed to review a submission, answer an enquiry, prevent abuse or meet a legal requirement. Administrator queue-audit records are append-only for accountability and are scheduled for deletion after 12 months. Authentication security logs are periodically pruned with a 12-month operational target; expired or revoked session records are pruned after a short security window. Billing records may need to be retained after cancellation for tax, accounting, dispute and fraud-prevention requirements.</p>
              <p>You can download account data, correct your profile, sign out other devices and delete an eligible free account from the account page. You may also ask for access, correction, erasure, restriction, portability or object to processing where the right applies. You can complain to the <a href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" target="_blank" rel="noreferrer">Information Commissioner’s Office</a>. Cancelling a paid subscription stops future renewal but does not itself delete the account or records that must be retained.</p>
              <Link className="privacy-request-link" href="/privacy-request">Make a privacy request</Link>
            </section>
          </article>
        </div>
      </section>
    </SecondaryPageShell>
  );
}
