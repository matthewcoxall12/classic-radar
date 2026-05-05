import { NextResponse } from "next/server";
import { runSourceDiscoveryAgent, type VercelAgentRunType } from "@/lib/agent/source-agent";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const runTypes: VercelAgentRunType[] = ["morning_broad", "midday_near_term", "evening_social", "manual_deep"];

function validSecret(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.AGENT_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const agentSecret = request.headers.get("x-agent-secret");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  return auth === `Bearer ${secret}` || agentSecret === secret || urlSecret === secret;
}

export async function GET(request: Request) {
  if (!validSecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedType = url.searchParams.get("type") ?? "manual_deep";
  const runType = (runTypes.includes(requestedType as VercelAgentRunType) ? requestedType : "manual_deep") as VercelAgentRunType;
  const sourceId = url.searchParams.get("sourceId") ?? undefined;
  const supabase = createServiceClient();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase service role environment variables are required for real source discovery."
      },
      { status: 500 }
    );
  }

  const result = await runSourceDiscoveryAgent(supabase, { runType, sourceId });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
