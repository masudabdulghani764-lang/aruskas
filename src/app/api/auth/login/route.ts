import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { loginUser, parseJsonBody, setSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";

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
    await enforceRateLimit(db, {
      scope: "auth_login",
      identifier: `${clientIp}:${parsed.email.toLowerCase()}`,
      limit: 15,
      windowMs: 5 * 60 * 1000,
      message:
        "Terlalu banyak percobaan masuk. Silakan tunggu 5 menit lalu coba lagi.",
    });

    const { user, token, expiresAt } = await loginUser(
      db,
      parsed,
      request.headers.get("user-agent")
    );
    await setSessionCookie(token, expiresAt);

    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
