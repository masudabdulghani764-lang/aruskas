import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  destroySession,
  findOrCreateGoogleUser,
  setSessionCookie,
} from "@/lib/auth";
import {
  createMobileAuthHandoffToken,
  exchangeGoogleCodeForProfile,
  getPublicOrigin,
  GOOGLE_MOBILE_NONCE_COOKIE,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  isValidMobileNonce,
  safeEqualStrings,
} from "@/lib/google-oauth";
import { resolveSafeNext } from "@/lib/navigation";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMobileReturnResponse(deepLink: string, message: string): Response {
  const safeHref = escapeHtmlAttr(deepLink);
  const safeJsonLink = JSON.stringify(deepLink);
  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Kembali ke ArusKas</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14532D;color:#FBFBF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;box-sizing:border-box}
    .card{max-width:360px;width:100%;background:#FBFBF9;color:#1C1917;border-radius:20px;padding:28px 24px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.22)}
    .logo{width:56px;height:56px;border-radius:16px;background:#14532D;color:#FBFBF9;font-weight:800;font-size:22px;display:inline-flex;align-items:center;justify-content:center;letter-spacing:-.02em;margin-bottom:14px}
    .dot{color:#F59E0B}
    h1{margin:0 0 8px;font-size:19px}
    p{margin:0 0 20px;font-size:14px;color:#57534E;line-height:1.5}
    a.btn{display:block;width:100%;padding:13px 16px;border-radius:12px;background:#14532D;color:#FBFBF9;text-decoration:none;font-weight:700;font-size:15px;box-sizing:border-box}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AK<span class="dot">.</span></div>
    <h1>${escapeHtmlAttr(message)}</h1>
    <p>Mengarahkan kembali ke aplikasi ArusKas secara otomatis…</p>
    <a class="btn" id="open-app" href="${safeHref}">Buka Aplikasi ArusKas</a>
  </div>
  <script>
    (function(){
      var target = ${safeJsonLink};
      window.location.replace(target);
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getPublicOrigin(request);
  const cookieStore = await cookies();

  const storedState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value ?? "";
  const storedVerifier = cookieStore.get(GOOGLE_VERIFIER_COOKIE)?.value ?? "";
  const storedNext = resolveSafeNext(
    cookieStore.get(GOOGLE_NEXT_COOKIE)?.value
  );
  const storedMobileNonce =
    cookieStore.get(GOOGLE_MOBILE_NONCE_COOKIE)?.value ?? "";
  const isMobileFlow = isValidMobileNonce(storedMobileNonce);

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
  cookieStore.set(GOOGLE_MOBILE_NONCE_COOKIE, "", clearOpts);

  const failRedirect = (errorCode: string) => {
    if (isMobileFlow) {
      return buildMobileReturnResponse(
        `aruskas://auth?error=${encodeURIComponent(errorCode)}&next=${encodeURIComponent(storedNext)}`,
        "Login Google dibatalkan"
      );
    }
    return NextResponse.redirect(
      `${origin}/masuk?error=${encodeURIComponent(errorCode)}&next=${encodeURIComponent(storedNext)}`
    );
  };

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return failRedirect("google_cancelled");
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
    return failRedirect("google_invalid_state");
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const profile = await exchangeGoogleCodeForProfile({
      code,
      codeVerifier: storedVerifier,
      redirectUri,
    });

    const db = await getDb();
    const { user, token, expiresAt } = await findOrCreateGoogleUser(
      db,
      profile,
      request.headers.get("user-agent")
    );

    if (isMobileFlow) {
      // Do not leave a stray browser session; the WebView creates its own session via mobile-exchange
      await destroySession(db, token);
      const handoff = createMobileAuthHandoffToken({
        userId: user.id,
        nonce: storedMobileNonce,
      });
      const deepLink = `aruskas://auth?handoff=${encodeURIComponent(handoff)}&next=${encodeURIComponent(storedNext)}`;
      return buildMobileReturnResponse(deepLink, "Login Google Berhasil");
    }

    await setSessionCookie(token, expiresAt);
    return NextResponse.redirect(`${origin}${storedNext}`);
  } catch (err) {
    console.error("[google-oauth] callback error:", err);
    return failRedirect("google_failed");
  }
}
