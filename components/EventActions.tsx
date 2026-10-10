"use client";

import { Bookmark, Check, Crown, LoaderCircle, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  eventId: string;
  returnTo: string;
  signedIn: boolean;
  canSave: boolean;
  initialSaved?: boolean;
  initialGoing?: boolean;
  goingCount?: number;
};

export function EventActions({
  eventId,
  returnTo,
  signedIn,
  canSave,
  initialSaved = false,
  initialGoing = false,
  goingCount = 0,
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [going, setGoing] = useState(initialGoing);
  const [count, setCount] = useState(goingCount);
  const [pending, setPending] = useState<"saved" | "going" | null>(null);
  const [message, setMessage] = useState("");
  const signInUrl = `/sign-in?return_to=${encodeURIComponent(returnTo)}`;

  async function toggle(kind: "saved" | "going") {
    if (pending) return;
    if (!signedIn) { router.push(signInUrl); return; }
    if (kind === "saved" && !canSave) { router.push("/membership"); return; }
    setPending(kind);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.getClaims();
      const userId = data?.claims?.sub;
      if (authError || typeof userId !== "string") { router.push(signInUrl); return; }
      const table = kind === "saved" ? "saved_events" : "event_attendance";
      const active = kind === "saved" ? saved : going;
      const result = active
        ? await supabase.from(table).delete().eq("user_id", userId).eq("event_id", eventId)
        : await supabase.from(table).upsert({ user_id: userId, event_id: eventId }, { onConflict: "user_id,event_id", ignoreDuplicates: true });
      if (result.error) throw result.error;
      if (kind === "saved") setSaved(!active);
      else {
        setGoing(!active);
        const { data: event } = await supabase.from("events").select("going_count").eq("id", eventId).maybeSingle();
        if (event) setCount(Number(event.going_count) || 0);
      }
      router.refresh();
    } catch {
      setMessage(kind === "saved" ? "Your wishlist could not be updated. Check your membership and try again." : "Your attendance could not be updated. Please try again.");
    } finally { setPending(null); }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div>
        <button
          type="button"
          onClick={() => toggle("going")}
          disabled={pending !== null}
          aria-pressed={going}
          className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition ${going ? "bg-racing text-paper" : "border border-racing/25 bg-racing/5 text-racing"}`}
        >
          {pending === "going" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : going ? (
            <Check className="h-4 w-4" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          {going ? "Going" : "I’m going"} · {count}
        </button>
      </div>
      {!signedIn ? (
        <Link
          href="/membership"
          className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 text-sm font-bold text-ink"
        >
          <Crown className="h-4 w-4 text-brass" /> Roadbook wishlist
        </Link>
      ) : canSave ? (
        <button
          type="button"
          onClick={() => toggle("saved")}
          disabled={pending !== null}
          aria-pressed={saved}
          className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold transition ${saved ? "border-oxblood bg-oxblood/10 text-oxblood" : "border-ink/15 bg-paper text-ink"}`}
        >
          {pending === "saved" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Bookmark className={saved ? "h-4 w-4 fill-current" : "h-4 w-4"} />
          )}
          {saved ? "Saved" : "Save event"}
        </button>
      ) : (
        <Link
          href="/membership"
          className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-brass/50 bg-brass/10 px-4 text-sm font-bold text-ink"
        >
          <Crown className="h-4 w-4 text-brass" /> Roadbook wishlist
        </Link>
      )}
      {message ? (
        <p className="basis-full text-xs font-bold text-oxblood" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
