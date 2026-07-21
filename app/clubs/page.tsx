import type { Metadata } from "next";
import { BadgeCheck, Building2, MapPinned, Users } from "lucide-react";
import PartnerForm from "@/components/partner-form";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { turnstileSiteKey } from "@/lib/auth-security";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clubs and partners | ClassicsGo",
  description: "Help local enthusiasts discover your classic-car club, venue, events or motoring business.",
  alternates: { canonical: "/clubs" },
};

export default function ClubsPage() {
  return (
    <SecondaryPageShell
      eyebrow="Clubs and partnerships"
      title="Put your organisation on the local motoring map"
      intro="We’re building a useful discovery service first, with fair partnership options for clubs, organisers, museums and relevant local firms."
    >
      <section className="benefits-section">
        <div className="shell benefits-grid">
          <article><Users size={25} /><h2>Club profiles</h2><p>A dependable home for your area, regular meets and official links.</p></article>
          <article><MapPinned size={25} /><h2>Local discovery</h2><p>Reach enthusiasts searching close enough to actually attend.</p></article>
          <article><BadgeCheck size={25} /><h2>Verified listings</h2><p>Keep dates and details connected to the official source.</p></article>
          <article><Building2 size={25} /><h2>Relevant partners</h2><p>Future placements for trusted garages, detailers, insurers and venues.</p></article>
        </div>
      </section>
      <section className="club-plan-section" aria-labelledby="club-plans-title">
        <div className="shell">
          <div className="club-plan-heading">
            <div>
              <p className="eyebrow">Organiser tools</p>
              <h2 id="club-plans-title">Start free. Grow when the audience does.</h2>
            </div>
            <p>Club subscriptions stay separate from enthusiast membership, so genuine community listings remain easy to publish.</p>
          </div>
          <div className="club-plan-grid">
            <article>
              <span>Verified listing</span>
              <h3>Free</h3>
              <ul>
                <li>Claimed club or venue profile</li>
                <li>Reviewed event submissions</li>
                <li>Official website and social links</li>
                <li>Event corrections and updates</li>
              </ul>
              <a href="#partner-form">Register a listing</a>
            </article>
            <article className="club-plan-featured">
              <span>Club Pro · early access</span>
              <h3>Built with clubs</h3>
              <ul>
                <li>Recurring event and season tools</li>
                <li>Follower announcements</li>
                <li>Listing and official-link analytics</li>
                <li>Member bundles and club benefits</li>
              </ul>
              <a href="#partner-form">Join the early register</a>
            </article>
            <article>
              <span>Regional partners</span>
              <h3>Clearly sponsored</h3>
              <ul>
                <li>Relevant geographic placements</li>
                <li>Roadbook Member offers</li>
                <li>Campaign reporting</li>
                <li>Organic event ranking stays independent</li>
              </ul>
              <a href="#partner-form">Discuss a partnership</a>
            </article>
          </div>
        </div>
      </section>
      <section className="partner-form-section">
        <div className="shell partner-form-grid" id="partner-form">
          <div>
            <p className="eyebrow">Early partner register</p>
            <h2>Help shape how this grows</h2>
            <p>Tell us what you represent and what would genuinely help. Early conversations will guide club tools, event management and advertising formats before any paid offer is introduced. You can also contact us at <a href={mailto(SITE_EMAILS.hello)}>{SITE_EMAILS.hello}</a>.</p>
          </div>
          <PartnerForm siteKey={turnstileSiteKey()} />
        </div>
      </section>
    </SecondaryPageShell>
  );
}
