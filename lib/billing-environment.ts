/** Accept server secret or restricted keys only in the deployment's own mode. */
export function stripeKeyMatchesMode(key: string, live: boolean): boolean {
  return (live ? /^(?:sk|rk)_live_[A-Za-z0-9]+$/ : /^(?:sk|rk)_test_[A-Za-z0-9]+$/).test(key);
}

/** Pure fail-closed billing deployment policy; never trust request host headers. */
export function resolveBillingEnvironment(env: Record<string, string | undefined>) {
  const production = env.VERCEL_ENV === "production";
  const testRequested = env.BILLING_MODE === "test";
  const sandbox = !production && testRequested && ["preview", "development"].includes(env.VERCEL_ENV ?? "");
  const testUserId = env.BILLING_TEST_USER_ID?.trim() ?? "";
  let site = "https://classicsgo.com";
  let valid = production && !testRequested;
  if (sandbox) {
    valid = false;
    try {
      const url = new URL(env.VERCEL_ENV === "preview" ? `https://${env.VERCEL_URL ?? ""}` : (env.BILLING_TEST_SITE_URL ?? ""));
      const preview = env.VERCEL_ENV === "preview" && url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
      const local = env.VERCEL_ENV === "development" && ["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
      if ((preview || local) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(testUserId)) {
        site = url.origin;
        valid = true;
      }
    } catch { /* Unconfigured sandbox stays disabled. */ }
  }
  return { live: !sandbox, testMode: sandbox, testUserId: sandbox ? testUserId : "", site, valid };
}
