"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await createClient().auth.signOut({ scope: "local" });
        window.location.assign("/");
      }}
      className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 text-sm font-bold text-ink"
    >
      <LogOut className="h-4 w-4" /> {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
