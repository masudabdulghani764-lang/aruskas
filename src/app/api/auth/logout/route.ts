import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  destroySession,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (rawToken) {
      destroySession(getDb(), rawToken);
    }
    await clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
