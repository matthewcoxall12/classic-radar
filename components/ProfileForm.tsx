"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/account/actions";

const initialState = { ok: false, message: "" };

export function ProfileForm({ profile }: { profile: { display_name: string; home_location: string | null; home_postcode: string | null; home_radius_miles: number } }) {
  const [state, action, pending] = useActionState(updateProfile, initialState);
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1 text-sm font-bold">Display name<input name="display_name" required maxLength={80} defaultValue={profile.display_name} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">Home town or area<input name="home_location" maxLength={120} defaultValue={profile.home_location || ""} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3" /></label>
        <label className="grid gap-1 text-sm font-bold">Postcode<input name="home_postcode" maxLength={16} defaultValue={profile.home_postcode || ""} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3 uppercase" /></label>
      </div>
      <label className="grid gap-1 text-sm font-bold">Preferred search radius<select name="home_radius_miles" defaultValue={String(profile.home_radius_miles)} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3"><option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option><option value="200">200 miles</option></select></label>
      <button type="submit" disabled={pending} className="focus-ring w-fit rounded-md bg-racing px-5 py-3 text-sm font-black text-paper disabled:opacity-60">{pending ? "Saving…" : "Save preferences"}</button>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm font-bold ${state.ok ? "text-racing" : "text-oxblood"}`}>{state.message}</p> : null}
    </form>
  );
}
