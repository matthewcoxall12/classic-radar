import Link from "next/link";

export default function NotFound() {
  return <section className="mx-auto max-w-2xl px-4 py-20 text-center"><p className="font-condensed text-sm font-bold uppercase tracking-[0.18em] text-oxblood">404 · wrong turning</p><h1 className="mt-3 font-serif text-5xl font-semibold">That page is not on the roadbook.</h1><p className="mt-4 leading-7 text-muted">The event may have moved, expired or never existed at this address.</p><Link href="/events?radius=uk" className="mt-7 inline-flex rounded-md bg-racing px-5 py-3 text-sm font-black text-paper">Find upcoming events</Link></section>;
}
