import type { Metadata } from "next";
import {
  CalendarDays,
  Bookmark,
  Check,
  Crown,
  Share2,
  Route,
  Search,
} from "lucide-react";
import Link from "next/link";
import { BillingControls } from "@/components/BillingControls";
import { paidBillingReady, billingConfig, billingRpc } from "@/lib/billing-server";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Membership",
  description:
    "Find classic car events for free. Explore Roadbook private wishlists, weekend plans, notes, sharing and calendar downloads.",
  alternates: { canonical: "/membership" },
};

const freeFeatures = [
  "Search and browse the full public event calendar",
  "Search by town, postcode, current location and distance",
  "Open official organiser and social links",
  "Mark “I’m going” and see public attendance",
  "Publish your own events with details, links and photos",
  "Read and write reviews after events",
];
const paidFeatures = [
  "Everything in Free",
  "Save events to a private wishlist",
  "Create private trip and weekend roadbooks",
  "Order event stops and add personal notes",
  "Share a weekend plan with friends by link",
  "Download event plans to your calendar",
];

export default async function MembershipPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [ready, viewer, params] = await Promise.all([paidBillingReady(), getViewer(), searchParams]);
  let canManage = false;
  if (viewer && billingConfig().serverReady) {
    try { canManage = !!(await billingRpc("billing_customer_for_user", { p_user_id: viewer.id })); } catch { /* Availability stays truthful when billing storage is unavailable. */ }
  }
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">
          Choose your route
        </p>
        <h1 className="mt-2 font-serif text-5xl font-semibold sm:text-6xl">
          Find for free. Plan with Roadbook.
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted">
          The event calendar remains open to everyone. Roadbook is an
          optional planning toolkit for enthusiasts who want to organise more
          weekends around the cars they love.
        </p>
      </div>
      {params.checkout === "complete" ? <p role="status" className="mt-6 rounded-xl bg-cream p-5 text-center text-sm font-bold">{viewer?.canUseRoadbook ? "Roadbook is active. Your next weekend starts here." : "Thanks. Roadbook activates after Stripe confirms your subscription. Refresh this page in a moment; contact Matthew if access does not appear."}</p> : params.checkout === "cancelled" ? <p role="status" className="mt-6 rounded-xl bg-cream p-5 text-center text-sm">Checkout closed. You can return whenever you are ready.</p> : null}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Plan
          title="Free"
          price="£0"
          description="For discovering events and joining the community."
          features={freeFeatures}
          icon={<Search className="h-7 w-7" />}
          action={
            <Link
              href="/events?radius=uk"
              className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-racing px-5 text-sm font-black text-racing"
            >
              Find events
            </Link>
          }
        />
        <Plan
          title="Roadbook"
          price={ready ? "£15/year or £2/month" : "Early access"}
          description="For a shortlist today and a great weekend tomorrow."
          features={paidFeatures}
          featured
          icon={<Crown className="h-7 w-7" />}
          action={<BillingControls ready={ready} signedIn={!!viewer} hasAccess={viewer?.canUseRoadbook === true} canManage={canManage} />}
        />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Benefit icon={<Bookmark />} title="Private wishlist">
          Keep the events you do not want to lose.
        </Benefit>
        <Benefit icon={<Route />} title="Weekend roadbooks">
          Group events into plans, order your stops and keep private notes.
        </Benefit>
        <Benefit icon={<Share2 />} title="Share your plans">
          Send a read-only plan to friends. Switch sharing off whenever you like.
        </Benefit>
        <Benefit icon={<CalendarDays />} title="Calendar downloads">
          Take your plans into your own calendar with an all-day event download.
        </Benefit>
      </div>
      <div className="mt-10 rounded-xl border border-brass/40 bg-brass/10 p-6 text-center">
        <p className="font-bold text-ink">
          {ready ? "£15 per year or £2 per month. Secure billing with Stripe." : "Roadbook is open by invitation. No payment is required for early access."}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          {ready ? <>Your subscription renews automatically at £15 a year or £2 a month, depending on the plan you choose. Annual membership saves £9 compared with 12 monthly payments. Cancel in billing management at any time to stop the next renewal; access continues until the end of your paid period. Your final price and renewal terms appear in Stripe Checkout before payment. Read our <Link href="/terms" className="underline">terms</Link>. </> : <>Request access using the email on your ClassicsGo account. Access is enabled individually; sending a request does not start a subscription. Paid checkout is not open yet. </>}Automated alerts, garage profiles and multiple saved search areas are planned for later and are not included yet.
        </p>
      </div>
    </section>
  );
}

function Plan({
  title,
  price,
  description,
  features,
  action,
  icon,
  featured = false,
}: {
  title: string;
  price: string;
  description: string;
  features: string[];
  action: React.ReactNode;
  icon: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-7 shadow-soft sm:p-8 ${featured ? "border-brass bg-racing text-paper" : "border-ink/10 bg-paper"}`}
    >
      <div
        className={`grid h-12 w-12 place-items-center rounded-full ${featured ? "bg-brass text-racing" : "bg-racing/10 text-racing"}`}
      >
        {icon}
      </div>
      <h2 className="mt-5 font-serif text-4xl font-semibold">{title}</h2>
      <p
        className={`mt-1 font-condensed text-2xl font-bold ${featured ? "text-brass" : "text-oxblood"}`}
      >
        {price}
      </p>
      <p
        className={`mt-3 text-sm leading-6 ${featured ? "text-paper/70" : "text-muted"}`}
      >
        {description}
      </p>
      <ul className="mt-6 grid gap-3">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm font-semibold"
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-brass" : "text-racing"}`}
            />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-7">{action}</div>
    </article>
  );
}

function Benefit({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-5">
      <span className="text-racing">{icon}</span>
      <h3 className="mt-3 font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}
