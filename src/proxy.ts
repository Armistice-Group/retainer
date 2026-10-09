import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { originFromHeaders } from "@/lib/request-origin";

const { auth } = NextAuth(authConfig);

// "/" just redirects (to /setup, /login or /dashboard) so it must be
// reachable logged out; /setup guards itself once the instance is set up.
const PUBLIC_PATHS = ["/", "/login", "/setup"];
// Multi-step flows (magic link, SSO completion, email confirmation) live
// under these as sub-paths and must be reachable while logged out — an
// exact-match check on PUBLIC_PATHS alone would bounce them to /login before
// the page ever gets a chance to sign the user in.
const PUBLIC_PREFIXES = ["/login/", "/invite/", "/verify-email/", "/share/", "/review/", "/i/"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const origin = originFromHeaders(req.headers, req.nextUrl.protocol.replace(":", "")) ?? req.nextUrl.origin;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && (pathname === "/login" || pathname === "/setup")) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  return NextResponse.next();
});

export const config = {
  // opengraph-image is the generated link-preview card and robots.txt the
  // crawler file (icons are served from /api/branding/icon) — fetched by
  // crawlers and chat apps with no session cookie, so they must never hit
  // the auth redirect below.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|opengraph-image|robots.txt).*)",
  ],
};
