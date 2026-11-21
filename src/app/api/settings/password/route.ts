import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  SESSION_COOKIE_NAME,
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
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

    await changePassword(
      await getDb(),
      currentUser.id,
      parsed.currentPassword,
      parsed.newPassword,
      currentToken
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
