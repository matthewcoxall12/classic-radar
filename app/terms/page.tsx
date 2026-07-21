import type { Metadata } from "next";
import Link from "next/link";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Membership terms | ClassicsGo",
  description:
    "Plain-language terms for ClassicsGo free accounts, Roadbook trials and paid membership.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <SecondaryPageShell
      eyebrow="Membership terms"
      title="A straightforward deal for better weekends"
      intro="These terms explain free accounts, the Roadbook trial and paid membership in plain language."
      note="Last updated 19 July 2026"
    >
      <section className="privacy-section">
        <div className="shell privacy-layout">
          <nav aria-label="Membership terms contents">
            <a href="#service">The service</a>
            <a href="#free">Free accounts</a>
            <a href="#trial">Roadbook trial</a>
            <a href="#paid">Paid membership</a>
            <a href="#renewal">Renewal and cancellation</a>
            <a href="#events">Event information</a>
            <a href="#changes">Changes and support</a>
          </nav>
          <article className="privacy-copy">
            <p className="privacy-lead">
              ClassicsGo keeps discovery and official event links
              free. Roadbook Member charges for additional planning,
              personalisation and alert tools—not access to basic event facts.
            </p>

            <section id="service">
              <h2>The service</h2>
              <p>ClassicsGo is currently an early-access service. Features may develop as coverage and club partnerships grow. You must provide accurate account information and use the service lawfully.</p>
            </section>

            <section id="free">
              <h2>Free accounts</h2>
              <p>A free account can sync saved events, mark events as Going, hold one home area, export individual calendar entries and show in-account reminders as saved event dates approach. Going totals are public, but the service does not publish attendee identities. There is no charge for a free account.</p>
            </section>

            <section id="trial">
              <h2>Roadbook trial</h2>
              <p>An eligible account may start one 14-day Roadbook trial. The app-level trial does not require payment details and does not automatically become a paid subscription. Paid features return to the free level when it expires unless you choose a plan.</p>
            </section>

            <section id="paid">
              <h2>Paid membership</h2>
              <p>Roadbook Member is offered at £2.99 monthly or £24.99 yearly, including applicable consumer taxes shown at checkout. A limited founding offer may reduce the first annual payment to £19.99; unless the checkout states otherwise, later annual renewals use the standard annual price then in force.</p>
              <p>Paid features include the entitlement set displayed before checkout. Partner discounts, priority access and competitions depend on participating partners and are not guaranteed to save a particular amount.</p>
            </section>

            <section id="renewal">
              <h2>Renewal and cancellation</h2>
              <p>Paid plans renew automatically at the interval and price disclosed at checkout until cancelled. You can cancel online from the billing area of your account; cancellation stops future renewal and paid access normally continues until the end of the paid period. Any statutory cancellation, refund or cooling-off rights remain unaffected.</p>
            </section>

            <section id="events">
              <h2>Event information</h2>
              <p>Listings are discovery information, not tickets or a guarantee that an event will proceed. Always check the linked organiser page before travelling. Organisers remain responsible for their event, admission, safety and terms.</p>
            </section>

            <section id="changes">
              <h2>Changes and support</h2>
              <p>ClassicsGo is operated by Matthew Coxall. Paid checkout is not currently open. Before it is enabled, these terms will include the service address and any additional information required for a paid consumer contract. Customer-support questions can be sent to <a href={mailto(SITE_EMAILS.support)}>{SITE_EMAILS.support}</a>; privacy and data requests can be sent to <a href={mailto(SITE_EMAILS.privacy)}>{SITE_EMAILS.privacy}</a> or through the privacy-request page.</p>
              <div className="terms-actions">
                <Link className="privacy-request-link" href="/privacy-request">Privacy request</Link>
                <Link className="terms-secondary-link" href="/membership">Compare membership</Link>
              </div>
            </section>
          </article>
        </div>
      </section>
    </SecondaryPageShell>
  );
}
