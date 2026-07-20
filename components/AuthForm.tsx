import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { GoogleSignIn } from "@/components/GoogleSignIn";

export function AuthForm({ returnTo = "/account" }: { returnTo?: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-5 shadow-soft sm:p-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">Sign in to ClassicsGo</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Use your Google account to save events, mark attendance, submit listings and manage your account.
      </p>
      <div className="mt-5"><GoogleSignIn returnTo={returnTo} /></div>
      <div className="mt-4 flex items-start gap-2 border-t border-ink/10 pt-4 text-xs leading-5 text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-racing" />
        <p>
          ClassicsGo never sees your Google password. By continuing, you agree to our{" "}
          <Link href="/terms" className="font-bold text-racing underline">terms</Link> and acknowledge our{" "}
          <Link href="/privacy" className="font-bold text-racing underline">privacy notice</Link>.
        </p>
      </div>
    </div>
  );
}
