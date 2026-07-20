import type { Metadata } from "next";
import { requireAuthenticatedPageUser } from "@/lib/app-auth";
import MemberPortal from "@/components/member-portal";
import {
  billingLaunchReady,
  billingPortalReady,
} from "@/lib/stripe-billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My roadbook | ClassicsGo",
  description: "Manage saved events, motoring roadbooks, alerts, preferences and ClassicsGo membership.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const plan = typeof params.plan === "string" ? params.plan : "";
  const trial = typeof params.trial === "string" ? params.trial : "";
  const checkout = typeof params.checkout === "string" ? params.checkout : "";
  const tab = typeof params.tab === "string" ? params.tab : "";
  if (plan === "monthly" || plan === "annual" || plan === "founding") query.set("plan", plan);
  if (trial === "1" || trial === "started") query.set("trial", trial);
  if (checkout === "success") query.set("checkout", checkout);
  if (["overview", "wishlist", "attending", "roadbooks", "alerts", "garage", "perks", "account"].includes(tab)) query.set("tab", tab);
  const returnTo = query.size > 0 ? `/account?${query.toString()}` : "/account";
  const user = await requireAuthenticatedPageUser(returnTo);

  return (
    <MemberPortal
      initialName={user.displayName}
      initialEmail={user.email}
      billingAvailable={billingLaunchReady()}
      billingPortalAvailable={billingPortalReady()}
    />
  );
}
