"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SaveEventButton({ eventId }: { eventId: string }) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  async function saveEvent() {
    const supabase = createClient();
    if (!supabase) {
      setSaved(true);
      setMessage("Saved locally for demo");
      return;
    }
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Sign in to save events");
      return;
    }
    const { error } = await supabase.from("saved_events").upsert({ user_id: user.id, event_id: eventId }, { onConflict: "user_id,event_id" });
    if (error) {
      setMessage("Could not save yet");
      return;
    }
    setSaved(true);
    setMessage("Saved");
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={saveEvent}
        className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-4 py-2 text-sm font-bold text-ink transition hover:border-oxblood/40"
      >
        <Heart className={saved ? "h-4 w-4 fill-oxblood text-oxblood" : "h-4 w-4"} />
        Save event
      </button>
      {message ? <span className="text-xs font-semibold text-muted">{message}</span> : null}
    </div>
  );
}
