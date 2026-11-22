import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { completePasswordReset } from "@/lib/password-reset";
import { enforceRateLimit, getClientIp } from "@/lib/security";

const resetSchema = z.object({
  token: z
    .string({ required_error: "Token reset wajib disertakan." })
    .trim()
    .min(10, "Tautan reset kata sandi tidak valid."),
  newPassword: z
    .string({ required_error: "Kata sandi baru wajib diisi." })
    .min(8, "Kata sandi baru minimal 8 karakter.")
    .max(128, "Kata sandi baru maksimal 128 karakter."),
});

export async function POST(request: Request) {
  try {
    const db = await getDb();
    await enforceRateLimit(db, {
      scope: "reset_password",
      identifier: getClientIp(request),
      limit: 10,
      windowMs: 15 * 60 * 1000,
      message:
        "Terlalu banyak percobaan reset kata sandi. Coba lagi dalam 15 menit.",
    });

    const rawBody = await parseJsonBody(request);
    const { token, newPassword } = resetSchema.parse(rawBody);

    await completePasswordReset(db, token, newPassword);
    return NextResponse.json({
      ok: true,
      message:
        "Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
