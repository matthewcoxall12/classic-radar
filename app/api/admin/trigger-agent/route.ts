import { NextResponse } from "next/server";
import type { VercelAgentRunType } from "@/lib/agent/source-agent";

export async function POST(request: Request) {
  const formData = await request.formData();
  const requestedRunType = String(formData.get("runType") ?? "manual_deep");
  const runType = (["morning_broad", "midday_near_term", "evening_social", "manual_deep"].includes(requestedRunType)
    ? requestedRunType
    : "manual_deep") as VercelAgentRunType;
  const secret = process.env.CRON_SECRET || process.env.AGENT_SECRET;

  if (!secret || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      ok: false,
      message: "Real source discovery requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AGENT_SECRET or CRON_SECRET."
    });
  }

  try {
    const origin = new URL(request.url).origin;
    const response = await fetch(`${origin}/api/agent/run?type=${runType}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`
      }
    });

    const body = await response.json().catch(() => ({}));
    return NextResponse.json({ ok: response.ok, status: response.status, ...body });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Agent trigger failed.",
        runType
      },
      { status: 502 }
    );
  }
}
