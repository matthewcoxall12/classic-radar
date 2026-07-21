import type { Metadata } from "next";
import Link from "next/link";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { readDeletionReceipt } from "@/lib/app-auth";

export const metadata: Metadata = {
  title: "Account deletion | ClassicsGo",
  description: "Secure account-deletion confirmation for ClassicsGo members.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountDeletedPage() {
  const receipt = await readDeletionReceipt().catch(() => null);
  if (!receipt) {
    return (
      <SecondaryPageShell
        eyebrow="Account privacy"
        title="Account deletion confirmation"
        intro="This link does not contain a valid recent deletion receipt, so it cannot confirm an account change."
        note="No valid deletion receipt"
      >
        <section className="privacy-section">
          <div className="shell privacy-copy">
            <h2>Need to manage your account?</h2>
            <p>
              Sign in to view the current account state, or use the privacy-request form if
              you asked for deletion and need help confirming its progress.
            </p>
            <p>
              <Link href="/sign-in?return_to=%2Faccount">Sign in</Link> ·{" "}
              <Link href="/privacy-request">Make a privacy request</Link> ·{" "}
              <Link href="/">Return to event search</Link>
            </p>
          </div>
        </section>
      </SecondaryPageShell>
    );
  }

  const pending = receipt.providerCleanupQueued;
  return (
    <SecondaryPageShell
      eyebrow="Account privacy"
      title="Your account has been deleted"
      intro="Your ClassicsGo profile, sessions and planning data are no longer available."
      note={pending ? "Provider cleanup queued securely" : "Deletion complete"}
    >
      <section className="privacy-section">
        <div className="shell privacy-copy">
          <h2>{pending ? "Provider cleanup is continuing" : "You are signed out"}</h2>
          <p>
            {pending
              ? "The app data was deleted first and external-provider cleanup is in a durable retry queue. A provider outage cannot restore the deleted app data."
              : "The app account and its local sign-in link were deleted. No separate managed-provider cleanup was required."}
          </p>
          <p>
            A one-way marker may be retained to prevent repeated trial use, and payment or
            privacy-request records may be kept only where legally required. See the privacy
            notice for details.
          </p>
          <p><Link href="/">Return to event search</Link> · <Link href="/privacy">Read the privacy notice</Link></p>
        </div>
      </section>
    </SecondaryPageShell>
  );
}
