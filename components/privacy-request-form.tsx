"use client";

import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import TurnstileField from "@/components/turnstile-field";

type FormStatus = { type: "idle" | "loading" | "success" | "error"; message: string };

export default function PrivacyRequestForm({ siteKey }: { siteKey: string | null }) {
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
    setStatus({ type: "loading", message: "Sending your request…" });

    try {
      const response = await fetch("/api/privacy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = (await response.json()) as { error?: string; message?: string; reference?: string };
      if (!response.ok) throw new Error(payload.error || "Request failed");
      form.reset();
      setStatus({
        type: "success",
        message: `${payload.message || "Your privacy request has been received."}${payload.reference ? ` Reference: ${payload.reference}.` : ""} We’ll reply by email.`,
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
    <form className="editorial-form compact-form" onSubmit={submit}>
      <div className="form-section-title">
        <span>01</span>
        <div>
          <h2>Your request</h2>
          <p>Tell us how we can help with your personal information.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>Your name *</span>
          <input name="contactName" required maxLength={100} autoComplete="name" />
        </label>
        <label>
          <span>Email address *</span>
          <input name="email" type="email" required maxLength={180} autoComplete="email" />
        </label>
        <label className="wide-field">
          <span>Request type *</span>
          <select name="requestType" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option value="access">Access my information</option>
            <option value="correction">Correct my information</option>
            <option value="deletion">Delete my information</option>
            <option value="restriction">Restrict how it is used</option>
            <option value="objection">Object to how it is used</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="wide-field">
          <span>What would you like us to do? *</span>
          <textarea
            name="message"
            required
            minLength={20}
            maxLength={1500}
            rows={7}
            placeholder="For example, ask to access, correct or delete information you submitted. Please include enough detail for us to identify it."
          />
        </label>
      </div>
      <TurnstileField
        siteKey={siteKey}
        action="privacy_request"
        token={captchaToken}
        onTokenChange={setCaptchaToken}
        resetKey={captchaResetKey}
      />
      <div className="form-actions">
        <button type="submit" disabled={!siteKey || !captchaToken || status.type === "loading"}>
          {status.type === "loading" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ArrowRight size={18} />
          )}
          {status.type === "loading" ? "Sending…" : "Send privacy request"}
        </button>
        <p>We’ll use these details only to identify and answer your request.</p>
      </div>
      <p className="privacy-form-note">
        Read how this request is handled in the full <Link href="/privacy">privacy notice</Link>.
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
