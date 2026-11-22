import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getEnrichedUserAgent, recordSecurityEvent } from "@/lib/audit-log";
import {
  createSession,
  parseJsonBody,
  setSessionCookie,
  toSafeUser,
} from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";
import {
  decryptTotpSecret,
  verifyTotpCode,
  verifyTwoFactorChallengeToken,
} from "@/lib/totp";

const verify2faSchema = z.object(
  {
    challengeToken: z.string().min(10, "Sesi verifikasi 2FA tidak valid."),
    code: z
      .string({ required_error: "Kode 6 digit wajib diisi." })
      .trim()
      .regex(/^\d{6}$/, "Masukkan 6 digit angka dari aplikasi Authenticator."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = verify2faSchema.parse(body);

    const challenge = verifyTwoFactorChallengeToken(parsed.challengeToken);
    if (!challenge) {
      throw new AppError(
        401,
        "Sesi verifikasi 2FA telah kedaluwarsa. Silakan masukkan email dan kata sandi lagi."
      );
    }

    const db = await getDb();
    const clientIp = getClientIp(request);
    const userAgent = getEnrichedUserAgent(request);

    await enforceRateLimit(db, {
      scope: "auth_2fa_verify",
      identifier: `${clientIp}:${challenge.userId}`,
      limit: 10,
      windowMs: 5 * 60 * 1000,
      message: "Terlalu banyak percobaan kode 2FA. Tunggu 5 menit lalu coba lagi.",
    });

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, challenge.userId))
      .limit(1);

    if (!row || !row.totpEnabled || !row.totpSecretEnc) {
      throw new AppError(401, "Konfigurasi 2FA akun tidak valid.");
    }

    const secret = decryptTotpSecret(row.totpSecretEnc);
    if (!verifyTotpCode(secret, parsed.code)) {
      await recordSecurityEvent(db, {
        userId: row.id,
        eventType: "login_failed",
        ipAddress: clientIp,
        userAgent,
        metadata: "Kode 2FA tidak valid",
      });
      throw new AppError(
        401,
        "Kode 6 digit tidak valid atau sudah berganti. Coba kode terbaru."
      );
    }

    // Consume challenge JTI so it cannot be replayed
    await enforceRateLimit(db, {
      scope: "auth_2fa_jti",
      identifier: challenge.jti,
      limit: 1,
      windowMs: 6 * 60 * 1000,
      message: "Sesi verifikasi 2FA sudah digunakan. Silakan login ulang.",
    });

    const session = await createSession(db, row.id, userAgent);
    await setSessionCookie(session.token, session.expiresAt);
    await recordSecurityEvent(db, {
      userId: row.id,
      eventType: "login_success",
      ipAddress: clientIp,
      userAgent,
      metadata: "Login terverifikasi 2FA Authenticator",
    });

    return NextResponse.json({ user: toSafeUser(row) });
  } catch (err) {
    return handleApiError(err);
  }
}
