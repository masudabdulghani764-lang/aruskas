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
  verifyPassword,
} from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";
import { createTwoFactorChallengeToken } from "@/lib/totp";

const loginSchema = z.object(
  {
    email: z
      .string({ required_error: "Email wajib diisi." })
      .trim()
      .email("Format email tidak valid."),
    password: z
      .string({ required_error: "Kata sandi wajib diisi." })
      .min(1, "Kata sandi wajib diisi."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = loginSchema.parse(body);

    const db = await getDb();
    const clientIp = getClientIp(request);
    const userAgent = getEnrichedUserAgent(request);
    const emailLower = parsed.email.trim().toLowerCase();

    await enforceRateLimit(db, {
      scope: "auth_login",
      identifier: `${clientIp}:${emailLower}`,
      limit: 15,
      windowMs: 5 * 60 * 1000,
      message:
        "Terlalu banyak percobaan masuk. Silakan tunggu 5 menit lalu coba lagi.",
    });

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, emailLower))
      .limit(1);

    if (!row) {
      throw new AppError(401, "Email atau kata sandi salah.");
    }

    const valid = await verifyPassword(parsed.password, row.passwordHash);
    if (!valid) {
      await recordSecurityEvent(db, {
        userId: row.id,
        eventType: "login_failed",
        ipAddress: clientIp,
        userAgent,
        metadata: "Kata sandi salah",
      });
      throw new AppError(401, "Email atau kata sandi salah.");
    }

    if (row.totpEnabled && row.totpSecretEnc) {
      const challengeToken = createTwoFactorChallengeToken(row.id);
      await recordSecurityEvent(db, {
        userId: row.id,
        eventType: "login_2fa_challenge",
        ipAddress: clientIp,
        userAgent,
        metadata: "Menunggu verifikasi 2FA Authenticator",
      });
      return NextResponse.json({
        requiresTwoFactor: true,
        challengeToken,
      });
    }

    const session = await createSession(db, row.id, userAgent);
    await setSessionCookie(session.token, session.expiresAt);
    await recordSecurityEvent(db, {
      userId: row.id,
      eventType: "login_success",
      ipAddress: clientIp,
      userAgent,
      metadata: "Login email & kata sandi",
    });

    return NextResponse.json({ user: toSafeUser(row) });
  } catch (err) {
    return handleApiError(err);
  }
}
