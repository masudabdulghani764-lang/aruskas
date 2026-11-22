import crypto from "node:crypto";
import { decryptVaultValue, encryptVaultValue } from "@/lib/crypto-vault";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates a fresh 160-bit Base32 TOTP secret (compatible with Google Authenticator & Authy).
 */
export function generateTotpSecret(): string {
  return encodeBase32(crypto.randomBytes(20));
}

/**
 * Builds a standard otpauth:// URI for authenticator apps.
 */
export function buildTotpOtpAuthUri(params: {
  email: string;
  secret: string;
  issuer?: string;
}): string {
  const issuer = params.issuer ?? "ArusKas";
  const label = encodeURIComponent(`${issuer}:${params.email}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Computes an RFC 6238 6-digit TOTP code for a given Base32 secret and timestamp.
 */
export function generateTotpCode(secret: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  const key = decodeBase32(secret);
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** TOTP_DIGITS;
  return String(otp).padStart(TOTP_DIGITS, "0");
}

/**
 * Verifies a 6-digit TOTP code within a ±window step tolerance (default ±1 = ±30s clock skew)
 * using constant-time comparison.
 */
export function verifyTotpCode(
  secret: string,
  rawCode: string,
  options?: { timestampMs?: number; window?: number }
): boolean {
  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const timestampMs = options?.timestampMs ?? Date.now();
  const window = options?.window ?? 1;
  const codeBuf = Buffer.from(code, "utf8");

  for (let delta = -window; delta <= window; delta++) {
    const candidate = generateTotpCode(
      secret,
      timestampMs + delta * TOTP_STEP_SECONDS * 1000
    );
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === codeBuf.length &&
      crypto.timingSafeEqual(candidateBuf, codeBuf)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Encrypts a user's TOTP secret for safe at-rest storage in PostgreSQL.
 */
export function encryptTotpSecret(secret: string): string {
  return encryptVaultValue(secret, "totp-secret");
}

/**
 * Decrypts a stored TOTP secret from PostgreSQL.
 */
export function decryptTotpSecret(encryptedSecret: string): string {
  return decryptVaultValue(encryptedSecret, "totp-secret");
}

/**
 * Creates a short-lived (5 minute) AES-256-GCM 2FA login challenge token bound to a user ID.
 */
export function createTwoFactorChallengeToken(userId: string): string {
  const payload = JSON.stringify({
    u: userId,
    j: crypto.randomBytes(12).toString("hex"),
    e: Date.now() + CHALLENGE_TTL_MS,
  });
  return encryptVaultValue(payload, "totp-login-challenge");
}

/**
 * Verifies and parses a 2FA login challenge token. Returns null if invalid or expired.
 */
export function verifyTwoFactorChallengeToken(
  token: string
): { userId: string; jti: string } | null {
  try {
    const raw = decryptVaultValue(token, "totp-login-challenge");
    const parsed = JSON.parse(raw) as { u?: unknown; j?: unknown; e?: unknown };
    if (
      typeof parsed.u !== "string" ||
      !parsed.u ||
      typeof parsed.j !== "string" ||
      !parsed.j ||
      typeof parsed.e !== "number"
    ) {
      return null;
    }
    if (parsed.e <= Date.now()) {
      return null;
    }
    return { userId: parsed.u, jti: parsed.j };
  } catch {
    return null;
  }
}
