"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function signIn() {
    const supabase = createClient();
    if (!supabase) {
      setMessage("Add Supabase environment variables to enable magic-link email.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/my-events` }
    });
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
      <h2 className="text-lg font-black">Sign in</h2>
      <p className="mt-1 text-sm text-muted">Use a Supabase magic link to save events and submit missing listings.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="Email address"
          className="focus-ring min-h-11 flex-1 rounded-md border border-ink/15 bg-paper px-3 font-semibold"
        />
        <Button type="button" onClick={signIn}>
          Send magic link
        </Button>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-muted">{message}</p> : null}
    </div>
  );
}
