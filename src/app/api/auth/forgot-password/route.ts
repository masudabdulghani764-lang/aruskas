import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPublicOrigin } from "@/lib/google-oauth";
import { requestPasswordReset } from "@/lib/password-reset";
import { enforceRateLimit, getClientIp } from "@/lib/security";

const forgotSchema = z.object({
  email: z
    .string({ required_error: "Email wajib diisi." })
    .trim()
    .email("Format email tidak valid."),
});

export async function POST(request: Request) {
  try {
    const db = await getDb();
    await enforceRateLimit(db, {
      scope: "forgot_password",
      identifier: getClientIp(request),
      limit: 5,
      windowMs: 15 * 60 * 1000,
      message:
        "Terlalu banyak permintaan reset kata sandi. Coba lagi dalam 15 menit.",
    });

    const rawBody = await parseJsonBody(request);
    const { email } = forgotSchema.parse(rawBody);
    const origin = getPublicOrigin(request);

    const result = await requestPasswordReset(db, email, origin);
    return NextResponse.json({
      ok: true,
      emailConfigured: result.emailConfigured,
      message: result.emailConfigured
        ? "Jika email tersebut terdaftar di ArusKas, tautan atur ulang kata sandi telah dikirim ke kotak masuk Anda (berlaku 30 menit)."
        : "Permintaan diterima. Pengiriman email otomatis akan aktif setelah RESEND_API_KEY dikonfigurasi di server.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
