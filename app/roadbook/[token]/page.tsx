import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SecondaryPageShell from "@/components/secondary-page-shell";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SharedRoadbook = {
  id: string;
  name: string;
  description: string;
  updated_at: string;
  user_id: string;
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
    const supabase = createSupabaseAdminClient();
    const roadbookResult = await supabase
      .from("roadbooks")
      .select("id,name,description,updated_at,user_id")
      .eq("share_token", token)
      .eq("is_shared", true)
      .maybeSingle();
    const roadbook = roadbookResult.data as SharedRoadbook | null;
    if (roadbookResult.error || !roadbook) return null;
    const profile = await supabase.from("profiles").select("tier").eq("id", roadbook.user_id).maybeSingle();
    if (profile.data?.tier !== "roadbook") return null;
    const eventResult = await supabase
      .from("roadbook_events")
      .select("position,notes,events(id,title,description,venue_name,town,postcode,start_date,end_date,start_time,price_text,booking_url,organiser_url,status)")
      .eq("roadbook_id", roadbook.id)
      .order("position");
    if (eventResult.error) return null;
    const events = (eventResult.data ?? []).flatMap((item) => {
      const event = item.events as unknown as Record<string, unknown> | null;
      if (!event || event.status !== "published") return [];
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
        notes: item.notes ?? "",
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
