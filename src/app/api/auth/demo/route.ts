import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { ensureDemoSeeded } from "@/lib/seed";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const user = await ensureDemoSeeded(db);
    const { token, expiresAt } = createSession(
      db,
      user.id,
      request.headers.get("user-agent")
    );
    await setSessionCookie(token, expiresAt);

    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
