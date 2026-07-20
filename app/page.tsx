import type { Metadata } from "next";
import { getSessionUser } from "@/lib/app-auth";
import EventFinder from "@/components/event-finder";
import { listIndexableEvents } from "@/lib/public-events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [user, initialEvents] = await Promise.all([
    getSessionUser(),
    listIndexableEvents(),
  ]);
  return (
    <EventFinder
      viewer={user ? { displayName: user.displayName, email: user.email } : null}
      initialEvents={initialEvents}
    />
  );
}
