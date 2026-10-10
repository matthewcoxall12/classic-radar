import type { Metadata } from "next";
import { Bug, Handshake, HelpCircle, LockKeyhole, Mail, MapPinned } from "lucide-react";
import { ContentPage } from "@/components/ContentPage";

export const metadata: Metadata = { title: "Contact", description: "Contact ClassicsGo support, listings, partnerships, privacy or security.", alternates: { canonical: "/contact" } };

const contacts = [
  { email: "matthewcoxall@googlemail.com", title: "Account and app support", text: "Signing in, account access or a problem using the site.", icon: <HelpCircle /> },
  { email: "matthewcoxall@googlemail.com", title: "Event listing updates", text: "Missing, changed or cancelled event information.", icon: <MapPinned /> },
  { email: "matthewcoxall@googlemail.com", title: "Clubs and partnerships", text: "Club calendars, venues, local firms and future partnerships.", icon: <Handshake /> },
  { email: "matthewcoxall@googlemail.com", title: "Privacy requests", text: "Access, correction, deletion or another data-rights request.", icon: <LockKeyhole /> },
  { email: "matthewcoxall@googlemail.com", title: "Security reports", text: "Report a suspected vulnerability responsibly. Please do not include passwords or tokens.", icon: <Bug /> }
];

export default function ContactPage() {
  return <ContentPage eyebrow="Contact" title="Get in touch with Matthew." intro="ClassicsGo is independently run by Matthew Coxall. Event corrections, questions and partnership ideas all reach me directly."><div className="grid gap-4 sm:grid-cols-2">{contacts.map((contact) => <a key={contact.title} href={`mailto:matthewcoxall@googlemail.com?subject=${encodeURIComponent(`ClassicsGo: ${contact.title}`)}`} className="rounded-xl border border-ink/10 bg-paper p-5 shadow-sm transition hover:border-racing/30"><span className="text-racing">{contact.icon}</span><h2 className="mt-3 text-lg font-black">{contact.title}</h2><p className="mt-1 text-sm leading-6 text-muted">{contact.text}</p><span className="mt-3 inline-flex items-center gap-2 break-all text-sm font-bold text-racing"><Mail className="h-4 w-4 shrink-0" />matthewcoxall@googlemail.com</span></a>)}</div><h2>Adding or changing your event</h2><p>Sign in to publish an event free and manage its details from My listings. For corrections to another listing, include the event link and the organiser’s official source in your email.</p></ContentPage>;
}
