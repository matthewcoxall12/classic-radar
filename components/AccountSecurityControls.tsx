"use client";

import { Download, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type PendingAction = "export" | "sessions" | "delete" | null;

export function AccountSecurityControls({ canDelete }: { canDelete: boolean }) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");

  async function exportData() {
    setPending("export");
    setMessage("");
    try {
      const response = await fetch("/account/export", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error || "Your data export could not be created.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `classicsgo-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your account export has been downloaded.");
    } catch {
      setMessage("Your export could not connect. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function revokeSessions() {
    setPending("sessions");
    setMessage("");
    try {
      const { error } = await createClient().auth.signOut({ scope: "global" });
      if (error) {
        setPending(null);
        setMessage("Your sessions could not be revoked. Please try again.");
        return;
      }
      // Reload after authentication cookie changes to clear the previous account context.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/?signed_out=all");
    } catch {
      setPending(null);
      setMessage("Your sessions could not be revoked. Check your connection and try again.");
    }
  }

  async function deleteAccount() {
    if (!canDelete || confirmation !== "DELETE") return;
    if (
      !window.confirm(
        "Permanently delete your ClassicsGo login and private account data? Public event listings may remain. This cannot be undone.",
      )
    )
      return;
    setPending("delete");
    setMessage("");
    try {
      const response = await fetch("/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setPending(null);
        setMessage(body.error || "Your account could not be deleted.");
        return;
      }
      await createClient().auth.signOut({ scope: "local" });
      // Reload after authentication cookie changes to clear the previous account context.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/?account=deleted");
    } catch {
      setPending(null);
      setMessage("The deletion result could not be confirmed. Refresh your account before trying again.");
    }
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-ink/10 bg-paper p-6 shadow-soft">
        <Download className="h-6 w-6 text-racing" />
        <h2 className="mt-3 font-serif text-3xl font-semibold">
          Download your data
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Get a JSON copy of your account, profile, saved events, attendance,
          submissions and any member-planning data. For safety, sign in again if
          your session is more than 15 minutes old.
        </p>
        <button
          type="button"
          onClick={exportData}
          disabled={pending !== null}
          className="focus-ring mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-racing px-4 text-sm font-black text-paper disabled:opacity-60"
        >
          {pending === "export" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}{" "}
          Download JSON
        </button>
      </div>

      <div className="rounded-xl border border-ink/10 bg-paper p-6 shadow-soft">
        <KeyRound className="h-6 w-6 text-racing" />
        <h2 className="mt-3 font-serif text-3xl font-semibold">
          Sign out everywhere
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sign out of this browser and end other ClassicsGo sessions as their
          current sign-in expires. You will need to sign in with Google again.
        </p>
        <button
          type="button"
          onClick={revokeSessions}
          disabled={pending !== null}
          className="focus-ring mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-racing/25 px-4 text-sm font-black text-racing disabled:opacity-60"
        >
          {pending === "sessions" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}{" "}
          Revoke all sessions
        </button>
      </div>

      <div className="rounded-xl border border-oxblood/25 bg-oxblood/5 p-6">
        <Trash2 className="h-6 w-6 text-oxblood" />
        <h2 className="mt-3 font-serif text-3xl font-semibold">
          Delete account
        </h2>
        {canDelete ? (
          <>
            <p className="mt-2 text-sm leading-6 text-muted">
              This permanently deletes your login and private account data.
              Public event listings may remain for other visitors. It cannot be undone. Sign in again first if your
              session is more than 15 minutes old.
            </p>
            <label className="mt-4 grid max-w-sm gap-1 text-sm font-bold">
              Type DELETE to confirm
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="focus-ring min-h-11 rounded-md border border-oxblood/30 bg-paper px-3"
              />
            </label>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={pending !== null || confirmation !== "DELETE"}
              className="focus-ring mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-oxblood px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {pending === "delete" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}{" "}
              Permanently delete account
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            Administrator and active paid-plan accounts require a manual
            ownership or billing check before deletion. Email{" "}
            <a
              href="mailto:matthewcoxall@googlemail.com"
              className="font-bold text-oxblood"
            >
              matthewcoxall@googlemail.com
            </a>
            .
          </p>
        )}
      </div>
      {message ? (
        <p
          role="status"
          className="rounded-md bg-cream p-3 text-sm font-bold text-ink"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
