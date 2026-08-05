import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/", "/login", "/signup", "/terms", "/privacy", "/pricing", "/security"];
// Multi-step flows (magic link, SSO completion, signup/email confirmation)
// live under these as sub-paths and must be reachable while logged out —
// an exact-match check on PUBLIC_PATHS alone would bounce them to /login
// before the page ever gets a chance to sign the user in.
const PUBLIC_PREFIXES = ["/login/", "/signup/", "/invite/", "/verify-email/", "/share/"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // icon/apple-icon/opengraph-image are the generated favicon, home-screen
  // icon, and social-card image (src/app/icon.tsx etc.); robots.txt/sitemap.xml
  // are the generated crawler files (src/app/robots.ts, sitemap.ts) — all of
  // these are fetched by crawlers and email clients with no session cookie at
  // all, so they must never hit the auth redirect below.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml).*)",
  ],
};
