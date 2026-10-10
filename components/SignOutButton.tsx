"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div>
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        setMessage("");
        try {
          const { error } = await createClient().auth.signOut({ scope: "local" });
          if (error) throw error;
          // Reload after authentication cookie changes to clear the previous account context.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/");
        } catch {
          setPending(false);
          setMessage("Sign-out could not complete. Please try again.");
        }
      }}
      className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 text-sm font-bold text-ink"
    >
      <LogOut className="h-4 w-4" /> {pending ? "Signing out…" : "Sign out"}
    </button>
    {message ? <p role="alert" className="mt-2 text-sm text-oxblood">{message}</p> : null}
    </div>
  );
}
