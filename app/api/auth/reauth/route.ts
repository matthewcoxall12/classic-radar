import {
  beginReauthentication,
  getSessionUser,
  publicSignInPath,
} from "@/lib/app-auth";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { siteOrigin } from "@/lib/auth-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const returnTo = safeRelativeReturnPath(
    new URL(request.url).searchParams.get("return_to") ?? "/account?tab=account",
  );
  const user = await getSessionUser();
  if (!user) {
    return Response.redirect(`${siteOrigin(request)}${publicSignInPath(returnTo)}`, 303);
  }
  await beginReauthentication(user);
  return Response.redirect(
    `${siteOrigin(request)}/sign-in?reauth=1&return_to=${encodeURIComponent(returnTo)}`,
    303,
  );
}
