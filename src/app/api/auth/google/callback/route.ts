import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { findOrCreateGoogleUser, setSessionCookie } from "@/lib/auth";
import {
  exchangeGoogleCodeForProfile,
  getPublicOrigin,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  safeEqualStrings,
} from "@/lib/google-oauth";
import { resolveSafeNext } from "@/lib/navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getPublicOrigin(request);
  const cookieStore = await cookies();

  const storedState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value ?? "";
  const storedVerifier = cookieStore.get(GOOGLE_VERIFIER_COOKIE)?.value ?? "";
  const storedNext = resolveSafeNext(
    cookieStore.get(GOOGLE_NEXT_COOKIE)?.value
  );

  // Clear transient OAuth cookies immediately
  const clearOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };
  cookieStore.set(GOOGLE_STATE_COOKIE, "", clearOpts);
  cookieStore.set(GOOGLE_VERIFIER_COOKIE, "", clearOpts);
  cookieStore.set(GOOGLE_NEXT_COOKIE, "", clearOpts);

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/masuk?error=google_cancelled&next=${encodeURIComponent(storedNext)}`
    );
  }

  const code = url.searchParams.get("code")?.trim() ?? "";
  const returnedState = url.searchParams.get("state")?.trim() ?? "";

  if (
    !code ||
    !returnedState ||
    !storedState ||
    !storedVerifier ||
    !safeEqualStrings(returnedState, storedState)
  ) {
    return NextResponse.redirect(
      `${origin}/masuk?error=google_invalid_state&next=${encodeURIComponent(storedNext)}`
    );
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const profile = await exchangeGoogleCodeForProfile({
      code,
      codeVerifier: storedVerifier,
      redirectUri,
    });

    const db = await getDb();
    const { token, expiresAt } = await findOrCreateGoogleUser(
      db,
      profile,
      request.headers.get("user-agent")
    );

    await setSessionCookie(token, expiresAt);
    return NextResponse.redirect(`${origin}${storedNext}`);
  } catch (err) {
    console.error("[google-oauth] callback error:", err);
    return NextResponse.redirect(
      `${origin}/masuk?error=google_failed&next=${encodeURIComponent(storedNext)}`
    );
  }
}
