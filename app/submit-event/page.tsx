import type { Metadata } from "next";
import { SubmitEventForm } from "@/components/SubmitEventForm";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Submit a classic car event", description: "Tell ClassicsGo about a missing classic car show, meet, autojumble, road run or club event.", robots: { index: false, follow: false } };

export default async function SubmitEventPage() {
  await requireViewer("/submit-event");
  return <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">Help the community</p><h1 className="mt-2 font-serif text-5xl font-semibold">Submit a missing event</h1><p className="mt-3 max-w-2xl leading-7 text-muted">Know about a local meet or club event we have not found? Share the official or public source link. Every submission is checked before publication.</p><SubmitEventForm /></section>;
}
