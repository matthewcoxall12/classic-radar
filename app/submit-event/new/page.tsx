import type { Metadata } from "next";
import Link from "next/link";
import { SubmitEventForm } from "@/components/SubmitEventForm";
import { requireViewer } from "@/lib/auth";
export const metadata: Metadata = { title: "Add a classic car event", robots: { index: false, follow: false } };
export default async function NewEventPage() {
  await requireViewer("/submit-event/new");
  return <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><Link href="/submit-event" className="focus-ring text-sm font-bold underline">Your events</Link><h1 className="mt-5 font-serif text-5xl font-semibold">Add an event</h1><p className="mt-3 leading-7 text-muted">Put your event on the map. Adding a listing is free, and it appears immediately when you publish.</p><SubmitEventForm /></section>;
}
