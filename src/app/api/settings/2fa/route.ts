import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getEnrichedUserAgent, recordSecurityEvent } from "@/lib/audit-log";
import {
  DEMO_EMAIL,
  parseJsonBody,
  requireCurrentUser,
  verifyPassword,
} from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { getClientIp } from "@/lib/security";
import {
  buildTotpOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/totp";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setup"),
  }),
  z.object({
    action: z.literal("enable"),
    secret: z
      .string()
      .trim()
      .regex(/^[A-Z2-7]{16,64}$/, "Format kunci 2FA tidak valid."),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Masukkan 6 digit angka dari aplikasi Authenticator."),
  }),
]);

const deleteSchema = z.object({
  currentPassword: z.string().optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Masukkan 6 digit kode Authenticator untuk menonaktifkan 2FA."),
});

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    const db = await getDb();
    const [row] = await db
      .select({
        totpEnabled: users.totpEnabled,
        googleSub: users.googleSub,
      })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1);

    return NextResponse.json({
      enabled: Boolean(row?.totpEnabled),
      isGoogleOnly: Boolean(row?.googleSub),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (currentUser.email.toLowerCase() === DEMO_EMAIL) {
      throw new AppError(403, "Akun demo tidak dapat mengaktifkan 2FA.");
    }

    const body = await parseJsonBody(request);
    const parsed = postSchema.parse(body);
    const db = await getDb();

    if (parsed.action === "setup") {
      const secret = generateTotpSecret();
      const otpAuthUri = buildTotpOtpAuthUri({
        email: currentUser.email,
        secret,
      });
      return NextResponse.json({ secret, otpAuthUri });
    }

    if (!verifyTotpCode(parsed.secret, parsed.code)) {
      throw new AppError(
        400,
        "Kode 6 digit tidak cocok. Pastikan jam HP otomatis dan masukkan kode terbaru."
      );
    }

    const encrypted = encryptTotpSecret(parsed.secret);
    await db
      .update(users)
      .set({
        totpSecretEnc: encrypted,
        totpEnabled: true,
      })
      .where(eq(users.id, currentUser.id));

    await recordSecurityEvent(db, {
      userId: currentUser.id,
      eventType: "totp_enabled",
      ipAddress: getClientIp(request),
      userAgent: getEnrichedUserAgent(request),
      metadata: "2FA Authenticator diaktifkan",
    });

    return NextResponse.json({ ok: true, enabled: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (currentUser.email.toLowerCase() === DEMO_EMAIL) {
      throw new AppError(403, "Akun demo tidak dapat mengubah 2FA.");
    }

    const body = await parseJsonBody(request);
    const parsed = deleteSchema.parse(body);
    const db = await getDb();

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1);

    if (!row || !row.totpEnabled || !row.totpSecretEnc) {
      throw new AppError(400, "2FA belum aktif pada akun ini.");
    }

    if (!row.googleSub) {
      if (!parsed.currentPassword) {
        throw new AppError(400, "Masukkan kata sandi saat ini untuk menonaktifkan 2FA.");
      }
      const passOk = await verifyPassword(parsed.currentPassword, row.passwordHash);
      if (!passOk) {
        throw new AppError(400, "Kata sandi saat ini tidak sesuai.");
      }
    }

    const secret = decryptTotpSecret(row.totpSecretEnc);
    if (!verifyTotpCode(secret, parsed.code)) {
      throw new AppError(400, "Kode 6 digit Authenticator tidak valid.");
    }

    await db
      .update(users)
      .set({
        totpSecretEnc: null,
        totpEnabled: false,
      })
      .where(eq(users.id, currentUser.id));

    await recordSecurityEvent(db, {
      userId: currentUser.id,
      eventType: "totp_disabled",
      ipAddress: getClientIp(request),
      userAgent: getEnrichedUserAgent(request),
      metadata: "2FA Authenticator dinonaktifkan",
    });

    return NextResponse.json({ ok: true, enabled: false });
  } catch (err) {
    return handleApiError(err);
  }
}
