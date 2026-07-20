import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getViewer, safeReturnPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in securely to save classic car events and manage your ClassicsGo account.",
  robots: { index: false, follow: false }
};

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(typeof params.return_to === "string" ? params.return_to : null);
  if (await getViewer()) redirect(returnTo);
  const oauthError = params.error === "oauth_failed";

  return (
    <section className="min-h-[calc(100vh-78px)] bg-cream px-4 py-12">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-racing">
          <Image src="/branding/classicsgo-logo-v2-512.png" alt="" width={48} height={48} className="h-12 w-12 rounded-full border border-brass/50" priority />
          <span className="font-serif text-2xl font-semibold uppercase tracking-wide">ClassicsGo</span>
        </Link>
        {oauthError ? (
          <p className="mb-4 flex items-start gap-2 rounded-md bg-oxblood/10 p-3 text-sm font-bold text-oxblood" role="alert">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Google sign-in was not completed. Please try again.
          </p>
        ) : null}
        <AuthForm returnTo={returnTo} />
        <Link href="/" className="mt-5 block text-center text-sm font-bold text-racing">← Back to event search</Link>
      </div>
    </section>
  );
}
