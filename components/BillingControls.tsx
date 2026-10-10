"use client";

import Link from "next/link";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export function BillingControls({ ready, signedIn, hasAccess, canManage, testMode = false }: { testMode?: boolean; ready: boolean; signedIn: boolean; hasAccess: boolean; canManage: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function openBilling(kind: "checkout" | "portal", plan: "annual" | "monthly" = "annual") {
    if (pending) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/billing/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error || "Billing could not open. Please try again."); setPending(false); return; }
      const url = new URL(String(body.url));
      if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)) throw new Error("Invalid billing address");
      window.location.assign(url.href);
    } catch { setMessage("Billing could not connect. Please try again or email Matthew."); setPending(false); }
  }
  return <div className="grid gap-3">
    {testMode ? <p role="status" className="rounded-md border border-brass p-3 text-sm font-black">TEST CHECKOUT: no real charge. Dedicated sandbox account only.</p> : null}
    {hasAccess ? <Link href="/my-events" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-brass px-5 text-sm font-black text-racing">Open Roadbook</Link>
      : ready ? signedIn ? <div className="grid gap-3"><button disabled={pending} onClick={() => openBilling("checkout", "annual")} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brass px-5 text-sm font-black text-racing disabled:opacity-60">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Join annually · £15/year</button><button disabled={pending} onClick={() => openBilling("checkout", "monthly")} className="focus-ring min-h-11 rounded-md border border-brass/50 px-5 text-sm font-bold disabled:opacity-60">Join monthly · £2/month</button><p className="text-xs">Annual membership saves £9 compared with 12 monthly payments.</p></div>
        : <Link href="/sign-in?return_to=%2Fmembership" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-brass px-5 text-sm font-black text-racing">Sign in to choose your plan</Link>
      : <Link href="mailto:matthewcoxall@googlemail.com?subject=ClassicsGo%20Roadbook%20early%20access" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-brass px-5 text-sm font-black text-racing">Request early access</Link>}
    {canManage ? <button disabled={pending} onClick={() => openBilling("portal")} className="focus-ring min-h-11 w-fit text-sm font-bold underline underline-offset-4 disabled:opacity-60">Manage subscription and payments</button> : null}
    {message ? <p role="alert" className="text-sm font-bold leading-6">{message}</p> : null}
  </div>;
}
