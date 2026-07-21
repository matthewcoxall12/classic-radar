import type { Metadata } from "next";
import { CheckCircle2, Link2, MapPin } from "lucide-react";
import SecondaryPageShell from "@/components/secondary-page-shell";
import SubmissionForm from "@/components/submission-form";
import { turnstileSiteKey } from "@/lib/auth-security";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit a classic car event | ClassicsGo",
  description: "Send a genuine UK classic-car event for review and inclusion in the ClassicsGo roadbook.",
  alternates: { canonical: "/submit-event" },
};

export default function SubmitEventPage() {
  return (
    <SecondaryPageShell
      eyebrow="Add to the roadbook"
      title="Share a classic-car event"
      intro="Shows, club meets, autojumbles, road runs and historic motorsport days are welcome. Genuine community listings are free."
    >
      <section className="form-page-section">
        <div className="shell form-page-grid">
          <SubmissionForm siteKey={turnstileSiteKey()} />
          <aside className="form-aside">
            <p className="eyebrow">Before you send it</p>
            <h2>What makes a useful listing?</h2>
            <ul>
              <li><CheckCircle2 size={18} /><span><strong>A confirmed date</strong> so nobody plans around an old announcement.</span></li>
              <li><MapPin size={18} /><span><strong>A clear venue</strong> including the nearest town and postcode.</span></li>
              <li><Link2 size={18} /><span><strong>An official public link</strong> where visitors can check changes and book.</span></li>
            </ul>
            <p className="aside-note">We may lightly edit descriptions for clarity. Your contact details are not shown on the public listing. For listing questions, email <a href={mailto(SITE_EMAILS.info)}>{SITE_EMAILS.info}</a>.</p>
          </aside>
        </div>
      </section>
    </SecondaryPageShell>
  );
}
