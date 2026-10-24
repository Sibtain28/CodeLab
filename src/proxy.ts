import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for private pages: if there is no session cookie at all,
 * send the visitor to /login right away. This only checks that a cookie
 * exists — the real check (signature, expiry, database session, project
 * membership) happens on the server in src/server/dal.ts for every page and
 * server action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/workspace/demo") return NextResponse.next(); // public mock demo

  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/workspace/:path*", "/join/:path*"],
};
