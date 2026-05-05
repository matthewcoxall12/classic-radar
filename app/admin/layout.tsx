import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { createClient } from "@/lib/supabase/server";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/agent-runs", label: "Agent runs" },
  { href: "/admin/settings", label: "Settings" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from("profiles").select("is_admin").eq("id", user.id).single() : { data: null };
    if (!user || !profile?.is_admin) {
      return (
        <section className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-3xl font-black">Admin access required</h1>
          <p className="mt-2 text-muted">Sign in with an account whose profile has is_admin set to true.</p>
          <div className="mt-6"><AuthForm /></div>
        </section>
      );
    }
  }
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-racing">Protected admin</p>
        <h1 className="mt-2 text-3xl font-black">Classic Radar admin</h1>
        <p className="mt-2 text-muted">RLS and profile.is_admin protect mutations when connected to Supabase.</p>
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
