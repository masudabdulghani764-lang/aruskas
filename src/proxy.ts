import { NextResponse, type NextRequest } from "next/server";
import { isAllowedOrigin } from "@/lib/security";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Bearer-token endpoints called by external automation (Gmail Apps Script, MacroDroid, iOS Shortcuts, Vercel Cron)
const CSRF_EXEMPT_PREFIXES = [
  "/api/integrations/bca/webhook",
  "/api/cron/",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(request.method.toUpperCase()) &&
    !CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json(
        {
          error: "Permintaan lintas domain tidak diizinkan.",
          code: "FORBIDDEN_ORIGIN",
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
