import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import {
  DEMO_EMAIL,
  hashPassword,
  revokeAllUserSessions,
} from "@/lib/auth";
import { AppError } from "@/lib/errors";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function isResetEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

async function sendResetEmailViaResend(params: {
  to: string;
  userName: string;
  resetUrl: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return false;
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "ArusKas <onboarding@resend.dev>";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; background: #FAF0DD; border-radius: 16px; color: #1C1917;">
      <h2 style="margin: 0 0 8px; color: #14532D;">ArusKas.</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #57534E;">Halo ${params.userName},</p>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6;">
        Kami menerima permintaan untuk mengatur ulang kata sandi akun ArusKas Anda. Klik tombol di bawah ini (berlaku selama 30 menit):
      </p>
      <a href="${params.resetUrl}" style="display: inline-block; background: #14532D; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 999px;">
        Atur Ulang Kata Sandi
      </a>
      <p style="margin: 20px 0 0; font-size: 12px; color: #78716C; line-height: 1.5;">
        Jika Anda tidak merasa meminta reset kata sandi, abaikan email ini. Akun Anda tetap aman.
      </p>
    </div>
  `.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "Atur Ulang Kata Sandi Akun ArusKas",
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[password-reset] Resend delivery failed:", res.status, errText);
    return false;
  }

  return true;
}

/**
 * Generates a single-use 30-minute password reset token and sends it via Resend if configured.
 * Never reveals whether an email address exists to callers.
 */
export async function requestPasswordReset(
  db: AppDb,
  rawEmail: string,
  origin: string
): Promise<{
  ok: true;
  emailSent: boolean;
  emailConfigured: boolean;
  _rawTokenForTests?: string;
}> {
  const email = rawEmail.trim().toLowerCase();
  const emailConfigured = isResetEmailConfigured();

  if (!email || email === DEMO_EMAIL) {
    return { ok: true, emailSent: false, emailConfigured };
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { ok: true, emailSent: false, emailConfigured };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();

  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    await tx.insert(passwordResetTokens).values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: now.toISOString(),
    });
  });

  const resetUrl = `${origin.replace(/\/+$/, "")}/reset-sandi?token=${encodeURIComponent(rawToken)}`;
  const emailSent = await sendResetEmailViaResend({
    to: user.email,
    userName: user.name,
    resetUrl,
  });

  return {
    ok: true,
    emailSent,
    emailConfigured,
    ...(process.env.NODE_ENV === "test" ? { _rawTokenForTests: rawToken } : {}),
  };
}

/**
 * Validates a reset token and atomically updates the user's password, marks token used,
 * and revokes all active sessions across devices.
 */
export async function completePasswordReset(
  db: AppDb,
  rawToken: string,
  newPassword: string
): Promise<void> {
  const cleanToken = rawToken.trim();
  if (!cleanToken) {
    throw new AppError(400, "Tautan reset kata sandi tidak valid.");
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new AppError(400, "Kata sandi baru harus 8 hingga 128 karakter.");
  }

  const tokenHash = hashResetToken(cleanToken);
  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
      userEmail: users.email,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.usedAt) {
    throw new AppError(
      400,
      "Tautan reset kata sandi tidak valid atau sudah pernah digunakan."
    );
  }

  if (row.userEmail.toLowerCase() === DEMO_EMAIL) {
    throw new AppError(403, "Kata sandi akun demo tidak dapat diubah.");
  }

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    throw new AppError(
      410,
      "Tautan reset kata sandi telah kedaluwarsa. Silakan minta tautan baru."
    );
  }

  const nextHash = await hashPassword(newPassword);
  const nowIso = new Date().toISOString();

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: nowIso })
      .where(
        and(
          eq(passwordResetTokens.id, row.id),
          isNull(passwordResetTokens.usedAt)
        )
      )
      .returning({ id: passwordResetTokens.id });

    if (claimed.length === 0) {
      throw new AppError(400, "Tautan reset kata sandi sudah pernah digunakan.");
    }

    await tx
      .update(users)
      .set({ passwordHash: nextHash })
      .where(eq(users.id, row.userId));
  });

  await revokeAllUserSessions(db, row.userId);
}
