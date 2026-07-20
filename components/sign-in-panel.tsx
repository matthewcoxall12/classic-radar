"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import TurnstileField from "@/components/turnstile-field";

export type AuthPanelMode =
  | "sign-in"
  | "sign-up"
  | "forgot"
  | "reset"
  | "check-email";

type Props = {
  mode: AuthPanelMode;
  returnTo?: string;
  error?: string;
  notice?: string;
  googleEnabled: boolean;
  emailEnabled: boolean;
  turnstileSiteKey: string | null;
  reauthenticate?: boolean;
};

const errorMessages: Record<string, string> = {
  oauth_failed: "Google sign-in could not be completed. Please try again.",
  email_confirmation_failed:
    "That confirmation link is invalid or has expired. Request a fresh email below.",
  account_claim:
    "That email is already linked. Sign in with the method you used before, or reset your email password.",
  setup_pending: "Account access is still being configured.",
  account_deleted:
    "That sign-in identity belongs to a deleted account. Contact privacy support if you need help.",
  reauth_failed:
    "Use the same account that requested this security check, or restart from your account page.",
  recovery_expired:
    "That recovery link is invalid or has expired. Request a fresh one.",
};

const noticeMessages: Record<string, string> = {
  password_updated: "Your password has been updated. Sign in with the new password.",
};

const content: Record<AuthPanelMode, { kicker: string; title: string; intro: string }> = {
  "sign-in": {
    kicker: "Secure member access",
    title: "Sign in to ClassicsGo",
    intro: "Open your saved events, Going list and personal roadbook.",
  },
  "sign-up": {
    kicker: "Free ClassicsGo account",
    title: "Create your account",
    intro: "Save events, mark yourself as Going and keep your weekend plans in sync.",
  },
  forgot: {
    kicker: "Account recovery",
    title: "Reset your password",
    intro: "Enter your account email and we’ll send a secure, time-limited reset link.",
  },
  reset: {
    kicker: "Choose a new password",
    title: "Secure your account",
    intro: "Use at least 12 characters, including a letter and a number.",
  },
  "check-email": {
    kicker: "Confirm your address",
    title: "Check your inbox",
    intro: "Open the confirmation email to finish creating your account. If you previously used Google, return to sign in and choose Google instead.",
  },
};

function endpointFor(mode: AuthPanelMode) {
  switch (mode) {
    case "sign-in":
      return "/api/auth/password/sign-in";
    case "sign-up":
      return "/api/auth/password/sign-up";
    case "forgot":
      return "/api/auth/password/forgot";
    case "reset":
      return "/api/auth/password/reset";
    case "check-email":
      return "/api/auth/password/resend";
  }
}

function actionFor(mode: AuthPanelMode) {
  return mode === "check-email" ? "password_confirm_resend" : `password_${mode.replace("-", "_")}`;
}

export default function SignInPanel({
  mode,
  returnTo = "/account",
  error = "",
  notice = "",
  googleEnabled,
  emailEnabled,
  turnstileSiteKey,
  reauthenticate = false,
}: Props) {
  const [status, setStatus] = useState<{
    loading: boolean;
    type: "idle" | "success" | "error";
    message: string;
  }>({
    loading: false,
    type: error ? "error" : notice ? "success" : "idle",
    message: errorMessages[error] ?? noticeMessages[notice] ?? "",
  });
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!captchaToken) {
      setStatus({
        loading: false,
        type: "error",
        message: "Complete the security check before continuing.",
      });
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");
    if ((mode === "sign-up" || mode === "reset") && password !== passwordConfirmation) {
      setStatus({ loading: false, type: "error", message: "The two passwords do not match." });
      return;
    }

    const body: Record<string, unknown> = { captchaToken, returnTo };
    if (data.has("email")) body.email = String(data.get("email") ?? "");
    if (data.has("name")) body.name = String(data.get("name") ?? "");
    if (data.has("password")) body.password = password;
    if (data.has("passwordConfirmation")) body.passwordConfirmation = passwordConfirmation;
    if (mode === "sign-up") body.termsAccepted = data.get("termsAccepted") === "on";

    setStatus({ loading: true, type: "idle", message: "" });
    try {
      const response = await fetch(endpointFor(mode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        data?: { redirectTo?: string; message?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Account access is temporarily unavailable.");
      }
      if (payload.data?.redirectTo) {
        window.location.assign(payload.data.redirectTo);
        return;
      }
      setStatus({
        loading: false,
        type: "success",
        message: payload.data?.message || "Done. Check your inbox for the next step.",
      });
      if (mode !== "reset") form.reset();
    } catch (requestError) {
      setStatus({
        loading: false,
        type: "error",
        message:
          requestError instanceof Error
            ? requestError.message
            : "Account access is temporarily unavailable.",
      });
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((current) => current + 1);
    }
  };

  const display = reauthenticate
    ? {
        kicker: "Security check",
        title: "Confirm it’s you",
        intro: "Sign in again before changing or downloading sensitive account data.",
      }
    : content[mode];
  const showGoogle = mode === "sign-in" || mode === "sign-up";
  const encodedReturn = encodeURIComponent(returnTo);
  const passwordAutocomplete = mode === "sign-in" ? "current-password" : "new-password";

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Link className="auth-brand" href="/">
          <span><Gauge size={27} /></span>
          <div><strong>ClassicsGo</strong><small>The weekend roadbook</small></div>
        </Link>

        <section className="auth-card" aria-labelledby="auth-title">
          <p className="auth-kicker">{display.kicker}</p>
          <h1 id="auth-title">{display.title}</h1>
          <p className="auth-intro">{display.intro}</p>

          {showGoogle ? (
            <div className="auth-options">
              {googleEnabled ? (
                <a
                  className="auth-provider auth-google"
                  href={`/api/auth/google?return_to=${encodedReturn}`}
                >
                  <span aria-hidden="true">G</span>
                  Continue with Google
                  <ArrowRight size={17} />
                </a>
              ) : (
                <button className="auth-provider" type="button" disabled>
                  <span aria-hidden="true">G</span>
                  Google setup pending
                </button>
              )}
              {mode === "sign-up" && googleEnabled ? (
                <p className="auth-provider-terms">
                  By continuing with Google, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.
                </p>
              ) : null}
            </div>
          ) : null}

          {showGoogle && emailEnabled ? (
            <div className="auth-divider"><span>or use email</span></div>
          ) : null}

          {emailEnabled && turnstileSiteKey ? (
            <form className="auth-email-form" onSubmit={submitEmail}>
              {mode === "sign-up" ? (
                <label>
                  <span>Your name</span>
                  <div><UserRound size={19} /><input name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" placeholder="Your name" disabled={status.loading} /></div>
                </label>
              ) : null}

              {mode !== "reset" ? (
                <label>
                  <span>Email address</span>
                  <div><Mail size={19} /><input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" disabled={status.loading} /></div>
                </label>
              ) : null}

              {mode === "sign-in" || mode === "sign-up" || mode === "reset" ? (
                <label>
                  <span>{mode === "reset" ? "New password" : "Password"}</span>
                  <div>
                    <LockKeyhole size={19} />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={mode === "sign-in" ? 1 : 12}
                      maxLength={128}
                      autoComplete={passwordAutocomplete}
                      placeholder={mode === "sign-in" ? "Your password" : "12+ characters"}
                      disabled={status.loading}
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
              ) : null}

              {mode === "sign-up" || mode === "reset" ? (
                <label>
                  <span>Confirm password</span>
                  <div><KeyRound size={19} /><input name="passwordConfirmation" type={showPassword ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" placeholder="Repeat your password" disabled={status.loading} /></div>
                </label>
              ) : null}

              {mode === "sign-in" ? (
                <Link className="auth-forgot-link" href={`/forgot-password?return_to=${encodedReturn}`}>
                  Forgot password?
                </Link>
              ) : null}

              {mode === "sign-up" ? (
                <label className="auth-terms-check">
                  <input name="termsAccepted" type="checkbox" required />
                  <span>I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</span>
                </label>
              ) : null}

              <TurnstileField
                siteKey={turnstileSiteKey}
                action={actionFor(mode)}
                token={captchaToken}
                onTokenChange={setCaptchaToken}
                resetKey={captchaResetKey}
              />
              <button type="submit" disabled={!captchaToken || status.loading}>
                {status.loading ? <LoaderCircle className="auth-spin" size={18} /> : mode === "forgot" || mode === "check-email" ? <Mail size={18} /> : <LockKeyhole size={18} />}
                {mode === "sign-in"
                  ? "Sign in"
                  : mode === "sign-up"
                    ? "Create account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : mode === "reset"
                        ? "Update password"
                        : "Resend confirmation"}
              </button>
            </form>
          ) : (
            <div className="auth-status error" role="status">
              <LockKeyhole size={18} />
              <span>Email accounts are not available yet. Continue with Google or try again later.</span>
            </div>
          )}

          {status.message ? (
            <div className={`auth-status ${status.type}`} role={status.type === "error" ? "alert" : "status"}>
              {status.type === "success" ? <Check size={18} /> : <LockKeyhole size={18} />}
              <span>{status.message}</span>
            </div>
          ) : null}

          <nav className="auth-switch" aria-label="Account options">
            {mode === "sign-in" && !reauthenticate ? (
              <p>New to ClassicsGo? <Link href={`/sign-up?return_to=${encodedReturn}`}>Create a free account</Link></p>
            ) : null}
            {mode === "sign-up" ? <p>Already have an account? <Link href={`/sign-in?return_to=${encodedReturn}`}>Sign in</Link></p> : null}
            {mode === "forgot" || mode === "reset" || mode === "check-email" ? <p><Link href={`/sign-in?return_to=${encodedReturn}`}>Back to sign in</Link></p> : null}
          </nav>

          <div className="auth-assurance">
            <LockKeyhole size={18} />
            <p>
              Google and email credentials are handled by Supabase. ClassicsGo
              stores only a revocable, encrypted-in-transit member session—not
              your Google password or plaintext email password.
            </p>
          </div>
        </section>

        <Link className="auth-back" href="/"><ArrowLeft size={16} /> Back to event search</Link>
      </div>
    </main>
  );
}
