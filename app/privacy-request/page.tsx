import type { Metadata } from "next";
import PrivacyRequestForm from "@/components/privacy-request-form";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { turnstileSiteKey } from "@/lib/auth-security";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy request | ClassicsGo",
  description: "Ask ClassicsGo to provide, correct or delete personal information.",
};

export default function PrivacyRequestPage() {
  const siteKey = turnstileSiteKey();
  return (
    <SecondaryPageShell
      eyebrow="Privacy request"
      title="Tell us what you need"
      intro="Use this form to ask for access to, correction of or deletion of personal information handled by ClassicsGo."
      note="Handled as a private request"
    >
      <section className="partner-form-section">
        <div className="shell partner-form-grid">
          <div>
            <p className="eyebrow">Your information</p>
            <h2>A direct route to the team</h2>
            <p>Give us the email address used for an event submission or partnership enquiry and explain what you would like us to do. We may need to verify your identity before acting on a request.</p>
            {!siteKey && (
              <p>The secure form is being connected. Until it opens, email <a href={mailto(SITE_EMAILS.privacy)}>{SITE_EMAILS.privacy}</a> with “Privacy request” in the subject line.</p>
            )}
          </div>
          <PrivacyRequestForm siteKey={siteKey} />
        </div>
      </section>
    </SecondaryPageShell>
  );
}
