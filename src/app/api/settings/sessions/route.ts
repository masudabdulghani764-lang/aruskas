import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { recordSecurityEvent } from "@/lib/audit-log";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  requireCurrentUser,
  revokeAllUserSessions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getClientIp } from "@/lib/security";

/**
 * Revokes all other active sessions for the current user (or all sessions including
 * the current device when `?includeCurrent=true`).
 */
export async function DELETE(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const url = new URL(request.url);
    const includeCurrent = url.searchParams.get("includeCurrent") === "true";

    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

    const db = await getDb();
    const revokedCount = await revokeAllUserSessions(
      db,
      currentUser.id,
      includeCurrent ? undefined : currentToken
    );

    await recordSecurityEvent(db, {
      userId: currentUser.id,
      eventType: "sessions_revoked",
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
      metadata: `${revokedCount} sesi perangkat dicabut`,
    });

    if (includeCurrent) {
      await clearSessionCookie();
    }

    return NextResponse.json({ ok: true, revokedCount });
  } catch (err) {
    return handleApiError(err);
  }
}
