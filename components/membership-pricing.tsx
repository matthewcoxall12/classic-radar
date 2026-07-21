"use client";

import {
  ArrowRight,
  Check,
  FlagTriangleRight,
  LoaderCircle,
  Minus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { membershipPrices, tierFeatures } from "@/lib/member-perks";
import styles from "./membership-pricing.module.css";

type BillingCadence = "annual" | "monthly";

const tierNames = {
  visitor: "Visitor",
  free: "Explorer",
  roadbook: "Roadbook Member",
} as const;

export default function MembershipPricing({ billingAvailable }: { billingAvailable: boolean }) {
  const [cadence, setCadence] = useState<BillingCadence>("annual");
  const [trialStatus, setTrialStatus] = useState<{ loading: boolean; message: string; error: boolean }>({ loading: false, message: "", error: false });
  const paidPrice = membershipPrices[cadence];

  const csrfToken = () => {
    const prefix = "__Host-cme_csrf=";
    const value = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    return value ? decodeURIComponent(value) : "";
  };

  const startTrial = async () => {
    setTrialStatus({ loading: true, message: "", error: false });
    try {
      const response = await fetch("/api/member/trial", {
        method: "POST",
        headers: { "X-CME-CSRF": csrfToken() },
      });
      if (response.status === 401) {
        window.location.assign("/sign-in?return_to=%2Faccount%3Ftrial%3D1");
        return;
      }
      let payload: { ok?: boolean; error?: { message?: string } };
      try {
        payload = await response.json() as { ok?: boolean; error?: { message?: string } };
      } catch {
        throw new Error(response.status === 404 ? "Trial activation is not open yet. You can still create a free account." : "The trial service could not be reached. Please try again.");
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "The trial could not be started.");
      window.location.assign("/account?trial=started");
    } catch (error) {
      setTrialStatus({
        loading: false,
        message: error instanceof Error ? error.message : "Trial activation is not available yet. You can still create a free account.",
        error: true,
      });
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.pricingSection} aria-labelledby="membership-options">
        <div className={styles.introRow}>
          <div>
            <p className={styles.kicker}>Membership options</p>
            <h2 id="membership-options">Keep discovery free. Pay for a better roadbook.</h2>
            <p>
              Anyone can search. A free account remembers the events you love. Roadbook membership adds the tools that
              make planning a motoring season genuinely easier.
            </p>
          </div>
          <div className={styles.cadence} role="group" aria-label="Choose billing period">
            <button
              type="button"
              className={cadence === "annual" ? styles.cadenceActive : undefined}
              aria-pressed={cadence === "annual"}
              onClick={() => setCadence("annual")}
            >
              Annual <span>save 30%</span>
            </button>
            <button
              type="button"
              className={cadence === "monthly" ? styles.cadenceActive : undefined}
              aria-pressed={cadence === "monthly"}
              onClick={() => setCadence("monthly")}
            >
              Monthly
            </button>
          </div>
        </div>

        <div className={styles.cards}>
          <article className={styles.planCard}>
            <span className={styles.planNumber}>01</span>
            <p className={styles.planLabel}>No account needed</p>
            <h3>Visitor</h3>
            <div className={styles.price}>£0 <small>always</small></div>
            <p>Find nearby shows, meets, runs and autojumbles, then continue to the official organiser.</p>
            <ul>
              <li><Check size={17} /> Location and postcode search</li>
              <li><Check size={17} /> Essential filters and event details</li>
              <li><Check size={17} /> Official organiser links</li>
            </ul>
            <Link className={styles.secondaryCta} href="/">
              Search events <ArrowRight size={17} />
            </Link>
          </article>

          <article className={styles.planCard}>
            <span className={styles.planNumber}>02</span>
            <p className={styles.planLabel}>Free account</p>
            <h3>Explorer</h3>
            <div className={styles.price}>£0 <small>forever</small></div>
            <p>Keep a personal shortlist, say when you’re going and see useful reminders for events coming up soon.</p>
            <ul>
              <li><Check size={17} /> Synced event wishlist</li>
              <li><Check size={17} /> Going responses and public event totals</li>
              <li><Check size={17} /> One home area and saved-event reminders</li>
              <li><Check size={17} /> Wishlist synced across devices</li>
            </ul>
            <Link className={styles.secondaryCta} href="/account">
              Create free account <ArrowRight size={17} />
            </Link>
          </article>

          <article className={`${styles.planCard} ${styles.featuredCard}`}>
            <div className={styles.recommended}><Sparkles size={14} /> Best for regular days out</div>
            <span className={styles.planNumber}>03</span>
            <p className={styles.planLabel}>Full planning toolkit</p>
            <h3>Roadbook Member</h3>
            <div className={styles.price}>{paidPrice.amount} <small>{paidPrice.cadence}</small></div>
            <p>Follow more places, catch new listings early and turn saved events into shared weekend plans.</p>
            <ul>
              <li><Check size={17} /> Custom event watchlists and live calendar</li>
              <li><Check size={17} /> Multiple areas, garage and recommendations</li>
              <li><Check size={17} /> Named roadbooks, sharing and ad-free browsing</li>
            </ul>
            {billingAvailable ? (
              <Link className={styles.primaryCta} href={`/account?plan=${paidPrice.plan}`}>
                Become a member <ArrowRight size={17} />
              </Link>
            ) : (
              <span className={styles.primaryCta}>Paid plans opening soon</span>
            )}
          </article>
        </div>

        <div className={styles.trialBanner}>
          <span><Sparkles size={23} /></span>
          <div><strong>Try every Roadbook feature free for 14 days</strong><p>No need to choose a paid plan before exploring alerts, trip planning and multiple areas.</p></div>
          <button type="button" disabled={trialStatus.loading} onClick={startTrial}>{trialStatus.loading ? <LoaderCircle className={styles.spin} size={16} /> : null} Start free trial <ArrowRight size={16} /></button>
          {trialStatus.message && <small className={trialStatus.error ? styles.trialError : undefined} role="status">{trialStatus.message}</small>}
        </div>

        <div className={styles.foundingOffer}>
          <FlagTriangleRight size={25} />
          <div>
            <strong>Founding member first year: {membershipPrices.founding.amount}</strong>
            <p>
              An early-supporter price for the first year while we grow event coverage and the member community.
              Standard annual pricing applies at renewal, and you can cancel before then. See the <Link href="/terms">membership terms</Link>.
            </p>
          </div>
          {billingAvailable ? (
            <Link href={`/account?plan=${membershipPrices.founding.plan}`}>
              Claim founding rate <ArrowRight size={16} />
            </Link>
          ) : (
            <span>Founding memberships opening soon</span>
          )}
        </div>
      </section>

      <section className={styles.comparison} aria-labelledby="compare-tiers">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>At a glance</p>
          <h2 id="compare-tiers">Compare every tier</h2>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th scope="col">What you get</th>
                {(Object.keys(tierNames) as Array<keyof typeof tierNames>).map((tier) => (
                  <th scope="col" key={tier}>{tierNames[tier]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tierFeatures.map((feature) => (
                <tr key={feature.label}>
                  <th scope="row">{feature.label}</th>
                  {(["visitor", "free", "roadbook"] as const).map((tier) => (
                    <td key={tier}>
                      {feature[tier]
                        ? <Check className={styles.yes} size={18} aria-label="Included" />
                        : <Minus className={styles.no} size={18} aria-label="Not included" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.promise}>
        <div><ShieldCheck size={24} /><strong>Useful before exclusive</strong></div>
        <p>
          Partner discounts, priority opportunities and member meets will roll out as credible partnerships are agreed.
          We will never imply an offer exists before it does; new benefits will be clearly dated in the member account.
        </p>
      </section>
    </div>
  );
}
