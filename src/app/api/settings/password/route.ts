import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { recordSecurityEvent } from "@/lib/audit-log";
import {
  SESSION_COOKIE_NAME,
  changePassword,
  parseJsonBody,
  requireCurrentUser,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getClientIp } from "@/lib/security";

const passwordSchema = z.object(
  {
    currentPassword: z
      .string({ required_error: "Kata sandi saat ini wajib diisi." })
      .min(1, "Kata sandi saat ini wajib diisi."),
    newPassword: z
      .string({ required_error: "Kata sandi baru wajib diisi." })
      .min(8, "Kata sandi baru minimal 8 karakter.")
      .max(128, "Kata sandi baru maksimal 128 karakter."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = passwordSchema.parse(body);
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

    const db = await getDb();
    await changePassword(
      db,
      currentUser.id,
      parsed.currentPassword,
      parsed.newPassword,
      currentToken
    );
    await recordSecurityEvent(db, {
      userId: currentUser.id,
      eventType: "password_changed",
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
      metadata: "Kata sandi diperbarui & sesi perangkat lain dicabut",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
