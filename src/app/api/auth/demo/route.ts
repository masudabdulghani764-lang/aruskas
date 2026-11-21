import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";
import { ensureDemoSeeded } from "@/lib/seed";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    await enforceRateLimit(db, {
      scope: "auth_demo",
      identifier: getClientIp(request),
      limit: 25,
      windowMs: 5 * 60 * 1000,
    });

    const user = await ensureDemoSeeded(db);
    const { token, expiresAt } = await createSession(
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
