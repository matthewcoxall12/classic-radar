"use client";

import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import TurnstileField from "@/components/turnstile-field";

type FormStatus = { type: "idle" | "loading" | "success" | "error"; message: string };

export default function PartnerForm({ siteKey }: { siteKey: string | null }) {
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
    const interest = typeof data.interest === "string" ? data.interest : "";
    if (interest && typeof data.message === "string") {
      data.message = `[Interest: ${interest}]\n${data.message}`;
    }
    setStatus({ type: "loading", message: "Sending your details…" });
    try {
      const response = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = (await response.json()) as { message?: string; error?: string; reference?: string };
      if (!response.ok) throw new Error(payload.error || "Enquiry failed");
      form.reset();
      setStatus({
        type: "success",
        message: `${payload.message || "Thanks — we'll be in touch."}${payload.reference ? ` Reference: ${payload.reference}.` : ""}`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((current) => current + 1);
    }
  };

  return (
    <form className="editorial-form compact-form" onSubmit={submit}>
      <div className="form-section-title">
        <span>01</span>
        <div><h2>Your organisation</h2><p>A few details to start the conversation.</p></div>
      </div>
      <div className="form-grid">
        <label><span>Your name *</span><input name="contactName" required maxLength={100} autoComplete="name" /></label>
        <label><span>Email address *</span><input name="email" type="email" required maxLength={180} autoComplete="email" /></label>
        <label><span>Organisation *</span><input name="organisationName" required maxLength={140} /></label>
        <label>
          <span>Organisation type *</span>
          <select name="organisationType" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option>Classic car club</option><option>Event organiser</option>
            <option>Museum or venue</option><option>Local motoring business</option>
            <option>National brand</option><option>Other</option>
          </select>
        </label>
        <label className="wide-field"><span>Website</span><input name="website" type="url" placeholder="https://" /></label>
        <label className="wide-field">
          <span>What are you interested in? *</span>
          <select name="interest" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option>Free verified listing</option>
            <option>Club Pro early access</option>
            <option>Regional sponsorship</option>
            <option>Member discount partner</option>
          </select>
        </label>
        <label className="wide-field">
          <span>How could we work together? *</span>
          <textarea name="message" required minLength={20} maxLength={1500} rows={6} placeholder="Tell us about your club, events, audience or local business." />
        </label>
      </div>
      <TurnstileField
        siteKey={siteKey}
        action="contact_form"
        token={captchaToken}
        onTokenChange={setCaptchaToken}
        resetKey={captchaResetKey}
      />
      <div className="form-actions">
        <button type="submit" disabled={!siteKey || !captchaToken || status.type === "loading"}>
          {status.type === "loading" ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
          {status.type === "loading" ? "Sending…" : "Start a conversation"}
        </button>
        <p>No commitment — this simply registers your interest.</p>
      </div>
      <p className="privacy-form-note">
        We use these details only to respond to your enquiry. See our <Link href="/privacy">privacy notice</Link>.
      </p>
      {status.type !== "idle" && (
        <div className={`form-status ${status.type}`} role={status.type === "error" ? "alert" : "status"} aria-live="polite">
          {status.type === "success" && <CheckCircle2 size={20} />}{status.message}
        </div>
      )}
    </form>
  );
}
