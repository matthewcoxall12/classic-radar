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

export function EventActions({ eventId, returnTo, signedIn, canSave, initialSaved = false, initialGoing = false, goingCount = 0 }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [going, setGoing] = useState(initialGoing);
  const [count, setCount] = useState(goingCount);
  const [pending, setPending] = useState<"saved" | "going" | null>(null);
  const [message, setMessage] = useState("");
  const signInUrl = `/sign-in?return_to=${encodeURIComponent(returnTo)}`;

  async function toggleSaved() {
    if (!signedIn) {
      window.location.assign(signInUrl);
      return;
    }
    if (!canSave) return;
    setPending("saved");
    setMessage("");
    const supabase = createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (typeof userId !== "string") {
      window.location.assign(signInUrl);
      return;
    }
    const result = saved
      ? await supabase.from("saved_events").delete().eq("user_id", userId).eq("event_id", eventId)
      : await supabase.from("saved_events").insert({ user_id: userId, event_id: eventId });
    setPending(null);
    if (result.error) {
      setMessage("That change could not be saved. Please try again.");
      return;
    }
    setSaved(!saved);
    router.refresh();
  }

  async function toggleGoing() {
    if (!signedIn) {
      window.location.assign(signInUrl);
      return;
    }
    setPending("going");
    setMessage("");
    const supabase = createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (typeof userId !== "string") {
      window.location.assign(signInUrl);
      return;
    }
    const result = going
      ? await supabase.from("event_attendance").delete().eq("user_id", userId).eq("event_id", eventId)
      : await supabase.from("event_attendance").insert({ user_id: userId, event_id: eventId });
    setPending(null);
    if (result.error) {
      setMessage("Your attendance could not be updated. Please try again.");
      return;
    }
    setGoing(!going);
    setCount((current) => Math.max(0, current + (going ? -1 : 1)));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div>
        <button
          type="button"
          onClick={toggleGoing}
          disabled={pending === "going"}
          aria-pressed={going}
          className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition ${going ? "bg-racing text-paper" : "border border-racing/25 bg-racing/5 text-racing"}`}
        >
          {pending === "going" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : going ? <Check className="h-4 w-4" /> : <Users className="h-4 w-4" />}
          {going ? "Going" : "I’m going"} · {count}
        </button>
      </div>
      {!signedIn ? (
        <Link href={signInUrl} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 text-sm font-bold text-ink">
          <Bookmark className="h-4 w-4" /> Sign in to plan
        </Link>
      ) : canSave ? (
        <button
          type="button"
          onClick={toggleSaved}
          disabled={pending === "saved"}
          aria-pressed={saved}
          className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold transition ${saved ? "border-oxblood bg-oxblood/10 text-oxblood" : "border-ink/15 bg-paper text-ink"}`}
        >
          {pending === "saved" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bookmark className={saved ? "h-4 w-4 fill-current" : "h-4 w-4"} />}
          {saved ? "Saved" : "Save event"}
        </button>
      ) : (
        <Link href="/membership" className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-brass/50 bg-brass/10 px-4 text-sm font-bold text-ink">
          <Crown className="h-4 w-4 text-brass" /> Save event
        </Link>
      )}
      {message ? <p className="basis-full text-xs font-bold text-oxblood" role="alert">{message}</p> : null}
    </div>
  );
}
