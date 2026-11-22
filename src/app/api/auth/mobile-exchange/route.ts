import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import {
  getPublicOrigin,
  verifyMobileAuthHandoffToken,
} from "@/lib/google-oauth";
import { resolveSafeNext } from "@/lib/navigation";
import { enforceRateLimit } from "@/lib/security";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getPublicOrigin(request);
  const handoff = url.searchParams.get("handoff")?.trim() ?? "";
  const nonce = url.searchParams.get("nonce")?.trim() ?? "";
  const nextPath = resolveSafeNext(url.searchParams.get("next"));

  const verified = verifyMobileAuthHandoffToken(handoff, nonce);
  if (!verified) {
    return NextResponse.redirect(
      `${origin}/masuk?error=google_invalid_state&next=${encodeURIComponent(nextPath)}`
    );
  }

  try {
    const db = await getDb();
    // Enforce strict single-use replay protection across serverless instances
    await enforceRateLimit(db, {
      scope: "mobile_oauth_jti",
      identifier: verified.jti,
      limit: 1,
      windowMs: 5 * 60 * 1000,
    });

    const { token, expiresAt } = await createSession(
      db,
      verified.userId,
      request.headers.get("user-agent")
    );
    await setSessionCookie(token, expiresAt);
    return NextResponse.redirect(`${origin}${nextPath}`);
  } catch {
    return NextResponse.redirect(
      `${origin}/masuk?error=google_invalid_state&next=${encodeURIComponent(nextPath)}`
    );
  }
}
