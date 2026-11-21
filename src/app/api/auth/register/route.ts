import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, registerUser, setSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";

const registerSchema = z.object(
  {
    name: z
      .string({ required_error: "Nama wajib diisi." })
      .trim()
      .min(2, "Nama minimal 2 karakter.")
      .max(100, "Nama maksimal 100 karakter."),
    email: z
      .string({ required_error: "Email wajib diisi." })
      .trim()
      .email("Format email tidak valid."),
    password: z
      .string({ required_error: "Kata sandi wajib diisi." })
      .min(8, "Kata sandi minimal 8 karakter.")
      .max(128, "Kata sandi maksimal 128 karakter."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = registerSchema.parse(body);

    const db = await getDb();
    await enforceRateLimit(db, {
      scope: "auth_register",
      identifier: getClientIp(request),
      limit: 10,
      windowMs: 15 * 60 * 1000,
      message:
        "Terlalu banyak percobaan pendaftaran dari jaringan ini. Silakan coba lagi nanti.",
    });

    const { user, token, expiresAt } = await registerUser(
      db,
      parsed,
      request.headers.get("user-agent")
    );
    await setSessionCookie(token, expiresAt);

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
