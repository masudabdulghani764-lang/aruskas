import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  buildGoogleAuthorizationUrl,
  generateGoogleOAuthTokens,
  getPublicOrigin,
  GOOGLE_MOBILE_NONCE_COOKIE,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  isGoogleOAuthConfigured,
  isValidMobileNonce,
} from "@/lib/google-oauth";
import { resolveSafeNext } from "@/lib/navigation";
import { enforceRateLimit, getClientIp } from "@/lib/security";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = resolveSafeNext(url.searchParams.get("next"));
  const origin = getPublicOrigin(request);

  try {
    const db = await getDb();
    await enforceRateLimit(db, {
      scope: "google_oauth_start",
      identifier: getClientIp(request),
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });
  } catch {
    return NextResponse.redirect(
      `${origin}/masuk?error=rate_limited&next=${encodeURIComponent(nextPath)}`
    );
  }

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      `${origin}/masuk?error=google_not_configured&next=${encodeURIComponent(nextPath)}`
    );
  }

  const { state, codeVerifier, codeChallenge } = generateGoogleOAuthTokens();
  const redirectUri = `${origin}/api/auth/google/callback`;
  const authUrl = buildGoogleAuthorizationUrl({
    redirectUri,
    state,
    codeChallenge,
  });

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  };

  const mobileApp = url.searchParams.get("mobile_app") === "1";
  const mobileNonce = url.searchParams.get("mobile_nonce")?.trim() ?? "";

  cookieStore.set(GOOGLE_STATE_COOKIE, state, cookieOpts);
  cookieStore.set(GOOGLE_VERIFIER_COOKIE, codeVerifier, cookieOpts);
  cookieStore.set(GOOGLE_NEXT_COOKIE, nextPath, cookieOpts);
  if (mobileApp && isValidMobileNonce(mobileNonce)) {
    cookieStore.set(GOOGLE_MOBILE_NONCE_COOKIE, mobileNonce, cookieOpts);
  } else {
    cookieStore.set(GOOGLE_MOBILE_NONCE_COOKIE, "", {
      ...cookieOpts,
      maxAge: 0,
    });
  }

  return NextResponse.redirect(authUrl);
}
