import type { Metadata } from "next";
import MembershipPricing from "@/components/membership-pricing";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { billingLaunchReady } from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Membership | ClassicsGo",
  description: "Compare free ClassicsGo accounts with Roadbook membership for alerts, planning and member benefits.",
  alternates: { canonical: "/membership" },
};

export default function MembershipPage() {
  const billingAvailable = billingLaunchReady();
  return (
    <SecondaryPageShell
      eyebrow="Join the roadbook"
      title="More weekends worth remembering"
      intro="Save events for free, or add advanced alerts, shared plans and a live motoring calendar with Roadbook membership."
      note={billingAvailable ? "Clear pricing · cancel any time" : "Free accounts and trials available · paid plans opening soon"}
    >
      <MembershipPricing billingAvailable={billingAvailable} />
    </SecondaryPageShell>
  );
}
