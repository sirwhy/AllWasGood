/**
 * Edge-runtime middleware. We deliberately avoid importing the full Auth.js
 * config (which pulls in bcrypt + Prisma — neither runs in Edge). Instead we
 * read the session cookie ourselves and let server components do real auth
 * checks via `auth()` from `@/lib/auth`.
 */
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/health",
  "/api/files",
  "/_next",
  "/favicon",
];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export default function middleware(req: NextRequest) {
  const { nextUrl, cookies } = req;
  const path = nextUrl.pathname;

  if (path === "/") return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => cookies.has(name));
  if (!hasSession) {
    const url = nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
