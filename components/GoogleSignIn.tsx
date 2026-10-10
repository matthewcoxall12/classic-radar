"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/browser";
import { googleWebClientId } from "@/lib/supabase/config";
import { safeReturnPath } from "@/lib/supabase/return-path";

type GoogleCredentialResponse = { credential?: string };

type GoogleIdentity = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        nonce: string;
        context?: "signin" | "signup" | "use";
        ux_mode?: "popup" | "redirect";
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          type: "standard";
          theme: "outline";
          size: "large";
          text: "continue_with";
          shape: "rectangular";
          width: number;
          logo_alignment: "left";
        }
      ): void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

function isFirstPartyOrigin() {
  return window.location.hostname === "classicsgo.com";
}

function subscribeOrigin() {
  return () => undefined;
}

async function noncePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

export function GoogleSignIn({ returnTo = "/account" }: { returnTo?: string }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const direct = useSyncExternalStore(subscribeOrigin, isFirstPartyOrigin, () => false);
  const [scriptReady, setScriptReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const initialiseGoogle = useCallback(async () => {
    if (!direct || !scriptReady || !buttonRef.current || !window.google) return;
    let pair: Awaited<ReturnType<typeof noncePair>>;
    try {
      pair = await noncePair();
    } catch {
      setMessage("The Google button could not load. Continue with Google below instead.");
      return;
    }
    const { raw, hashed } = pair;
    const element = buttonRef.current;
    if (!element) return;
    element.replaceChildren();

    window.google.accounts.id.initialize({
      client_id: googleWebClientId,
      nonce: hashed,
      context: "signin",
      ux_mode: "popup",
      callback: async ({ credential }) => {
        if (!credential) {
          setMessage("Google did not return a sign-in credential. Please try again.");
          return;
        }
        setPending(true);
        setMessage("");
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce: raw
          });
          if (error) {
            setPending(false);
            setMessage("The Google pop-up could not complete sign-in. Use the secure redirect below instead.");
            return;
          }
          // Delivery is deliberately best-effort: email provider issues must never
          // delay or prevent an otherwise valid sign-in.
          try {
            await supabase.functions.invoke("send-welcome-email", { timeout: 3000 });
          } catch {
            // The function keeps its own idempotency ledger and can be retried later.
          }
          window.location.assign(safeReturnPath(returnTo));
        } catch {
          setPending(false);
          setMessage("Sign-in could not connect. Check your connection and try again.");
        }
      }
    });
    window.google.accounts.id.renderButton(element, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: Math.min(360, Math.max(240, element.clientWidth || 320)),
      logo_alignment: "left"
    });
  }, [direct, returnTo, scriptReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void initialiseGoogle(); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialiseGoogle]);

  async function oauthFallback() {
    setPending(true);
    setMessage("");
    try {
      const supabase = createClient();
      const redirectTo = `https://classicsgo.com/auth/callback?next=${encodeURIComponent(safeReturnPath(returnTo))}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
      if (error) {
        setPending(false);
        setMessage("Google sign-in is temporarily unavailable. Please try again.");
      }
    } catch {
      setPending(false);
      setMessage("Sign-in could not connect. Check your connection and try again.");
    }
  }

  return (
    <div className="grid gap-3">
      {direct ? (
        <>
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            onError={() => setMessage("The Google pop-up did not load. Use the secure redirect below instead.")}
          />
          <div ref={buttonRef} className={`min-h-11 w-full overflow-hidden rounded-md ${pending ? "pointer-events-none opacity-60" : ""}`} aria-busy={pending} aria-label="Continue with Google" />
          {pending ? (
            <p className="flex items-center gap-2 text-sm font-bold text-muted" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Finishing secure sign-in…
            </p>
          ) : null}
          <button
            type="button"
            onClick={oauthFallback}
            disabled={pending}
            className="focus-ring min-h-11 w-fit rounded-sm text-left text-xs font-medium text-muted underline decoration-ink/25 underline-offset-4 transition hover:text-racing disabled:cursor-wait disabled:opacity-60"
          >
            Having trouble? Use Google redirect
          </button>
        </>
      ) : (
        <p className="flex items-start gap-2 rounded-md border border-brass/35 bg-brass/10 p-4 text-sm font-bold leading-6 text-ink" role="status">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-racing" />
          Sign-in is enabled only on the production ClassicsGo domain. This preview remains read-only while the current live site stays protected.
        </p>
      )}
      {message ? (
        <p className="flex items-start gap-2 rounded-md bg-oxblood/10 p-3 text-sm font-bold text-oxblood" role="alert">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </p>
      ) : null}
    </div>
  );
}
