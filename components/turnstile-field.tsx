"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

export type TurnstileStatus =
  | "loading"
  | "ready"
  | "verified"
  | "expired"
  | "error";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

function turnstileApi() {
  return (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
}

export default function TurnstileField({
  siteKey,
  action,
  token,
  onTokenChange,
  onStatusChange,
  resetKey = 0,
}: {
  siteKey: string | null;
  action: string;
  token: string;
  onTokenChange: (token: string) => void;
  onStatusChange?: (status: TurnstileStatus) => void;
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const [status, setStatus] = useState<TurnstileStatus>("loading");

  const updateStatus = useCallback(
    (nextStatus: TurnstileStatus) => {
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  const clearToken = useCallback(
    (nextStatus: TurnstileStatus) => {
      onTokenChange("");
      updateStatus(nextStatus);
    },
    [onTokenChange, updateStatus],
  );

  const renderWidget = useCallback(() => {
    const api = turnstileApi();
    const container = containerRef.current;
    if (!api || !container || !siteKey || widgetIdRef.current) return;

    updateStatus("ready");
    widgetIdRef.current = api.render(container, {
      sitekey: siteKey,
      action,
      theme: "light",
      callback: (nextToken) => {
        onTokenChange(nextToken);
        updateStatus("verified");
      },
      "expired-callback": () => clearToken("expired"),
      "timeout-callback": () => clearToken("expired"),
      "error-callback": () => clearToken("error"),
    });
  }, [action, clearToken, onTokenChange, siteKey, updateStatus]);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    onTokenChange("");

    const widgetId = widgetIdRef.current;
    const api = turnstileApi();
    if (widgetId && api) {
      api.reset(widgetId);
      updateStatus("ready");
    } else {
      updateStatus("loading");
      renderWidget();
    }
  }, [onTokenChange, renderWidget, resetKey, updateStatus]);

  useEffect(
    () => () => {
      const widgetId = widgetIdRef.current;
      if (widgetId) turnstileApi()?.remove(widgetId);
      widgetIdRef.current = null;
    },
    [],
  );

  if (!siteKey) {
    return (
      <p className="form-security-pending" role="status">
        This form will open when production bot protection is connected.
      </p>
    );
  }

  const visibleStatus = token ? "verified" : status;
  const statusMessage = {
    loading: "Loading the secure bot check…",
    ready: "Complete the secure check to continue.",
    verified: "Security check complete.",
    expired: "The security check expired. Complete it again to continue.",
    error: "The security check could not load. Refresh the page and try again.",
  }[visibleStatus];

  return (
    <div className="form-turnstile">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => clearToken("error")}
      />
      <div ref={containerRef} />
      <p
        className={`turnstile-status ${visibleStatus}`}
        role={visibleStatus === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {statusMessage}
      </p>
    </div>
  );
}
