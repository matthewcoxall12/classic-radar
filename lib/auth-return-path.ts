const RETURN_PATH_ORIGIN = "https://app.local";

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, RETURN_PATH_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== RETURN_PATH_ORIGIN || isAuthenticationPath(url.pathname)) {
    return "/";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isAuthenticationPath(pathname: string): boolean {
  return (
    pathname === "/sign-in" ||
    pathname === "/callback" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/signin-") ||
    pathname.startsWith("/signout-")
  );
}
