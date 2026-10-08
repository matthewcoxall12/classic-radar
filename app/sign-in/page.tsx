import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { EventImage } from "@/components/EventImage";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getViewer, safeReturnPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in securely to save classic car events and manage your ClassicsGo account.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(
    typeof params.return_to === "string" ? params.return_to : null,
  );
  if (await getViewer()) redirect(returnTo);
  const oauthError = params.error === "oauth_failed";

  return (
    <section className="page-shell sign-in-layout">
      <div className="sign-in-story">
        <p className="eyebrow">Your next chapter</p>
        <h1 className="font-serif text-5xl font-semibold mt-4">
          Good days deserve
          <br />a place in your diary.
        </h1>
        <p className="text-muted text-sm leading-7 mt-5 mb-8">
          Join for free to save discoveries, mark attendance and share events
          with the community.
        </p>
        <div className="h-[300px]">
          <EventImage type="Club meet" />
        </div>
      </div>
      <div>
        {oauthError ? (
          <p
            className="mb-4 flex items-start gap-2 rounded-md bg-oxblood/10 p-3 text-sm font-bold text-oxblood"
            role="alert"
          >
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Google sign-in
            was not completed. Please try again.
          </p>
        ) : null}
        <AuthForm returnTo={returnTo} />
        <Link
          href="/"
          className="mt-5 block text-center text-sm font-bold text-racing"
        >
          ← Back to event search
        </Link>
      </div>
    </section>
  );
}
