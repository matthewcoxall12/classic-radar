import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/agent-runs", label: "Agent runs" },
  { href: "/admin/settings", label: "Settings" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-serif text-4xl font-semibold">Admin access required</h1>
        <p className="mt-2 text-muted">Sign in with an authorised ClassicsGo administrator account.</p>
        <div className="mt-6"><AuthForm returnTo="/admin" /></div>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-racing">Protected admin</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold">ClassicsGo admin</h1>
        <p className="mt-2 text-muted">Event review, source health and discovery operations.</p>
      </div>
      <nav className="mb-6 flex gap-2 overflow-x-auto">
        {adminNav.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm font-black text-ink hover:border-racing/40">
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </section>
  );
}
