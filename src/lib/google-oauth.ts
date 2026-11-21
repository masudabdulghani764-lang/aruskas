import crypto from "node:crypto";
import { AppError } from "@/lib/errors";

export const GOOGLE_STATE_COOKIE = "aruskas_google_state";
export const GOOGLE_VERIFIER_COOKIE = "aruskas_google_verifier";
export const GOOGLE_NEXT_COOKIE = "aruskas_google_next";

export type GoogleUserProfile = {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

/**
 * Returns true when Google OAuth 2.0 credentials are configured in environment variables.
 */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

/**
 * Resolves the public origin for OAuth redirect URI construction.
 */
export function getPublicOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const url = new URL(request.url);
  return url.origin;
}

/**
 * Generates a PKCE S256 verifier/challenge pair and CSRF state token.
 */
export function generateGoogleOAuthTokens(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

/**
 * Builds the Google OAuth 2.0 Authorization Endpoint URL with PKCE S256.
 */
export function buildGoogleAuthorizationUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new AppError(503, "Login Google belum dikonfigurasi di server.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Constant-time string comparison for OAuth CSRF state validation.
 */
export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Exchanges a Google authorization code + PKCE verifier for a verified Google user profile.
 */
export async function exchangeGoogleCodeForProfile(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleUserProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new AppError(503, "Login Google belum dikonfigurasi di server.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier,
    }),
  });

  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new AppError(
      401,
      tokenData.error_description ?? "Gagal memverifikasi otorisasi Google."
    );
  }

  const userRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }
  );

  const profile = (await userRes.json().catch(() => ({}))) as {
    sub?: string;
    email?: string;
    name?: string;
    email_verified?: boolean;
  };

  if (!userRes.ok || !profile.sub || !profile.email) {
    throw new AppError(401, "Profil akun Google tidak dapat dibaca.");
  }

  if (profile.email_verified === false) {
    throw new AppError(
      403,
      "Email akun Google Anda belum terverifikasi. Verifikasi email Google terlebih dahulu."
    );
  }

  return {
    sub: profile.sub,
    email: profile.email.trim().toLowerCase(),
    name:
      profile.name?.trim().slice(0, 100) ||
      profile.email.split("@")[0].slice(0, 100),
    emailVerified: true,
  };
}
