import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { roadbookCalendar } from "@/lib/roadbook-calendar";
import type { ClassicEvent } from "@/lib/types";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in to download your Roadbook.", { status: 401 });
  if (!viewer.canUseRoadbook) return new Response("Roadbook membership required.", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: book } = await supabase.from("roadbooks").select("name").eq("id", id).eq("user_id", viewer.id).maybeSingle();
  if (!book) return new Response("Not found", { status: 404 });
  const { data, error } = await supabase.from("roadbook_events").select("events(*)").eq("roadbook_id", id).order("position");
  if (error) return new Response("Calendar could not be generated.", { status: 503 });
  const events = (data || []).map((row) => row.events as unknown as ClassicEvent | null).filter((event): event is ClassicEvent => Boolean(event));
  return new Response(roadbookCalendar(book.name, events), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="classicsgo-roadbook.ics"', "Cache-Control": "private, no-store" } });
}
