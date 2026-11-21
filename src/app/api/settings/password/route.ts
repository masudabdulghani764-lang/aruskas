import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  changePassword,
  parseJsonBody,
  requireCurrentUser,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

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

    await changePassword(
      await getDb(),
      currentUser.id,
      parsed.currentPassword,
      parsed.newPassword
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
