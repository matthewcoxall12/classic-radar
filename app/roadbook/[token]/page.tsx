import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type SharedRoadbook = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  events: Array<Record<string, unknown>>;
};

type SharedEvent = {
  id: string;
  title: string;
  description: string;
  venue: string;
  town: string;
  postcode: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  price: string;
  official_url: string;
  notes: string;
};

async function getSharedRoadbook(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const roadbookResult = await supabase.rpc("get_shared_roadbook", {
      p_share_token: token,
    });
    const roadbook = roadbookResult.data as SharedRoadbook | null;
    if (roadbookResult.error || !roadbook) return null;
    const events = (roadbook.events ?? []).flatMap((event) => {
      if (!event?.id) return [];
      return [{
        id: String(event.id),
        title: String(event.title),
        description: String(event.description ?? ""),
        venue: String(event.venue_name ?? "Venue to be confirmed"),
        town: String(event.town ?? ""),
        postcode: String(event.postcode ?? ""),
        start_date: String(event.start_date),
        end_date: event.end_date ? String(event.end_date) : null,
        start_time: event.start_time ? String(event.start_time).slice(0, 5) : "All day",
        price: String(event.price_text ?? "See official event page"),
        official_url: String(event.booking_url ?? event.organiser_url ?? "https://classicsgo.com"),
        notes: typeof event.notes === "string" ? event.notes : "",
      } satisfies SharedEvent];
    });
    return { roadbook, events };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const result = await getSharedRoadbook(token);
  return {
    title: result
      ? `${result.roadbook.name} | ClassicsGo`
      : "Shared roadbook | ClassicsGo",
    robots: { index: false, follow: false },
  };
}

export default async function SharedRoadbookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getSharedRoadbook(token);
  if (!result) notFound();

  return (
    <SecondaryPageShell
      eyebrow="Shared roadbook"
      title={result.roadbook.name}
      intro={
        result.roadbook.description ||
        "A classic-motoring event plan shared by a Roadbook Member."
      }
      note="Anyone with this private share link can view the plan"
    >
      <section className="privacy-section">
        <div className="shell privacy-layout">
          <article className="privacy-copy">
            {result.events.length ? (
              result.events.map((event: SharedEvent) => (
                <section key={event.id}>
                  <p className="eyebrow">
                    {event.start_date}
                    {event.end_date ? ` to ${event.end_date}` : ""} · {event.start_time}
                  </p>
                  <h2>{event.title}</h2>
                  <p>
                    {event.venue}, {event.town}, {event.postcode} · {event.price}
                  </p>
                  <p>{event.description}</p>
                  {event.notes ? <p><strong>Roadbook note:</strong> {event.notes}</p> : null}
                  <p>
                    <a href={event.official_url} target="_blank" rel="noreferrer">
                      View the official event page
                    </a>
                  </p>
                </section>
              ))
            ) : (
              <section>
                <h2>No events added yet</h2>
                <p>The member has shared this roadbook before adding its first stop.</p>
              </section>
            )}
          </article>
        </div>
      </section>
    </SecondaryPageShell>
  );
}
