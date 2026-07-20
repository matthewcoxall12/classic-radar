import type { ReactNode } from "react";

export function ContentPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl border-b border-ink/10 pb-8">
        <p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold leading-tight sm:text-6xl">{title}</h1>
        <p className="mt-4 text-lg leading-8 text-muted">{intro}</p>
      </header>
      <div className="prose-classicsgo mt-9">{children}</div>
    </section>
  );
}
