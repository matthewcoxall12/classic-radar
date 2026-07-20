import { UserSubmissionCard } from "@/components/admin/UserSubmissionCard";
import { getUserSubmissions } from "@/lib/submissions";

export default async function AdminSubmissionsPage() {
  const submissions = await getUserSubmissions();
  const pending = submissions.filter((submission) => submission.status === "pending");
  const handled = submissions.filter((submission) => submission.status !== "pending");

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-serif text-3xl font-semibold">Member submissions</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Review links submitted by members. Creating a draft never publishes it; final verification and publication happen in Events.</p>
      </div>
      <section aria-labelledby="pending-submissions" className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 id="pending-submissions" className="text-xl font-black">Pending</h3>
          <span className="rounded-full bg-racing/10 px-3 py-1 text-xs font-black text-racing">{pending.length}</span>
        </div>
        {pending.length ? pending.map((submission) => <UserSubmissionCard key={submission.id} submission={submission} />) : <p className="rounded-lg border border-dashed border-ink/20 bg-paper p-6 text-sm text-muted">No member submissions are waiting for review.</p>}
      </section>
      {handled.length ? (
        <section aria-labelledby="handled-submissions" className="grid gap-4">
          <h3 id="handled-submissions" className="text-xl font-black">Recently handled</h3>
          {handled.map((submission) => <UserSubmissionCard key={submission.id} submission={submission} />)}
        </section>
      ) : null}
    </div>
  );
}
