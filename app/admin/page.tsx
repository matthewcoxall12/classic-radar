import { Bot, Database, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { getAdminEvents, getAgentRuns, getReviewQueue } from "@/lib/events";

export default async function AdminPage() {
  const [events, queue, runs] = await Promise.all([getAdminEvents(), getReviewQueue(), getAgentRuns()]);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric icon={<Database className="h-5 w-5" />} label="Events" value={events.length} href="/admin/events" />
      <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Review queue" value={queue.length} href="/admin/review" />
      <Metric icon={<Bot className="h-5 w-5" />} label="Agent runs" value={runs.length} href="/admin/agent-runs" />
      <div className="rounded-lg border border-ink/10 bg-paper p-5 shadow-soft md:col-span-3">
        <h2 className="text-xl font-black">Automated discovery</h2>
        <p className="mt-2 text-sm text-muted">The secured GitHub workflow discovers UK and European events daily at 03:17 UTC. Recent runs and review items appear above.</p>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, href }: { icon: ReactNode; label: string; value: number; href: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-racing/10 text-racing">{icon}</span>
        <span className="text-3xl font-black">{value}</span>
      </div>
      <h2 className="mt-4 text-lg font-black">{label}</h2>
      <ButtonLink href={href} variant="secondary" className="mt-4 w-full">Open</ButtonLink>
    </div>
  );
}
