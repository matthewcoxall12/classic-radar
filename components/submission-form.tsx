"use client";

import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import TurnstileField from "@/components/turnstile-field";

type FormStatus = { type: "idle" | "loading" | "success" | "error"; message: string };

export default function SubmissionForm({ siteKey }: { siteKey: string | null }) {
  const [status, setStatus] = useState<FormStatus>({ type: "idle", message: "" });
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!captchaToken) {
      setStatus({ type: "error", message: "Complete the security check before sending." });
      return;
    }
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.captchaToken = captchaToken;
    setStatus({ type: "loading", message: "Sending your event…" });

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = (await response.json()) as { message?: string; error?: string; reference?: string };
      if (!response.ok) throw new Error(payload.error || "Submission failed");
      form.reset();
      setStatus({
        type: "success",
        message: `${payload.message || "Thanks — your event is in the review queue."}${payload.reference ? ` Reference: ${payload.reference}.` : ""}`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((current) => current + 1);
    }
  };

  return (
    <form className="editorial-form" onSubmit={submit}>
      <div className="form-section-title">
        <span>01</span>
        <div><h2>The event</h2><p>Tell us what enthusiasts can expect.</p></div>
      </div>
      <div className="form-grid">
        <label className="wide-field">
          <span>Event name *</span>
          <input name="eventName" required maxLength={120} placeholder="e.g. Riverside Classic Vehicle Gathering" />
        </label>
        <label>
          <span>Event category *</span>
          <select name="category" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option>Show</option><option>Meet</option><option>Autojumble</option>
            <option>Motorsport</option><option>Run</option>
          </select>
        </label>
        <label>
          <span>Official page *</span>
          <input name="officialUrl" type="url" required placeholder="https://" />
          <small>Official website or public social-event page.</small>
        </label>
        <label className="wide-field">
          <span>Short description *</span>
          <textarea name="description" required minLength={30} maxLength={1500} rows={5} placeholder="What makes the event worth the drive? Include any vehicle eligibility or booking details." />
        </label>
      </div>

      <div className="form-section-title">
        <span>02</span>
        <div><h2>Where and when</h2><p>Enough detail for people to plan the route.</p></div>
      </div>
      <div className="form-grid">
        <label>
          <span>Venue *</span>
          <input name="venue" required maxLength={160} placeholder="Venue or showground" />
        </label>
        <label>
          <span>Town and postcode *</span>
          <input name="townPostcode" required maxLength={160} placeholder="Town or city, postal code, country" />
        </label>
        <label>
          <span>Start date *</span>
          <input name="startDate" type="date" required />
        </label>
        <label>
          <span>End date</span>
          <input name="endDate" type="date" />
        </label>
      </div>

      <div className="form-section-title">
        <span>03</span>
        <div><h2>Your details</h2><p>Used only if we need to verify the listing.</p></div>
      </div>
      <div className="form-grid">
        <label>
          <span>Your name *</span>
          <input name="organiserName" required maxLength={100} autoComplete="name" />
        </label>
        <label>
          <span>Email address *</span>
          <input name="email" type="email" required maxLength={180} autoComplete="email" />
        </label>
        <label className="wide-field">
          <span>Club or organisation</span>
          <input name="clubName" maxLength={120} placeholder="Optional" />
        </label>
      </div>

      <TurnstileField
        siteKey={siteKey}
        action="event_submission"
        token={captchaToken}
        onTokenChange={setCaptchaToken}
        resetKey={captchaResetKey}
      />
      <div className="form-actions">
        <button type="submit" disabled={!siteKey || !captchaToken || status.type === "loading"}>
          {status.type === "loading" ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
          {status.type === "loading" ? "Sending…" : "Send for review"}
        </button>
        <p>Free community listings. No payment details required.</p>
      </div>
      <p className="privacy-form-note">
        Your contact details are used only to review this submission. See our <Link href="/privacy">privacy notice</Link>.
      </p>
      {status.type !== "idle" && (
        <div className={`form-status ${status.type}`} role={status.type === "error" ? "alert" : "status"} aria-live="polite">
          {status.type === "success" && <CheckCircle2 size={20} />}
          {status.message}
        </div>
      )}
    </form>
  );
}
