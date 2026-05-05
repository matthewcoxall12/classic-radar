import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Classic Radar",
  description: "UK-wide classic car event finder for shows, meets, rallies, autojumbles and club events."
};

const navItems = [
  { href: "/events", label: "Events" },
  { href: "/my-events", label: "My Events" },
  { href: "/submit-event", label: "Submit" },
  { href: "/admin", label: "Admin" }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/92 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-3 font-black tracking-wide text-ink">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-racing text-paper">CR</span>
              <span className="text-lg">Classic Radar</span>
            </Link>
            <nav className="flex items-center gap-1 overflow-x-auto text-sm font-semibold text-muted">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 hover:bg-cream hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-ink/10 bg-ink py-8 text-paper">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-sm text-paper/75 md:flex-row md:items-center md:justify-between">
            <p>Classic Radar. Always check organiser links before travelling.</p>
            <p>No ticket payments are handled inside the app.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
