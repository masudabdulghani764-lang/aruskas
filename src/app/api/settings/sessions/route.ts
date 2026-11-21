import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  requireCurrentUser,
  revokeAllUserSessions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

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

    const revokedCount = await revokeAllUserSessions(
      await getDb(),
      currentUser.id,
      includeCurrent ? undefined : currentToken
    );

    if (includeCurrent) {
      await clearSessionCookie();
    }

    return NextResponse.json({ ok: true, revokedCount });
  } catch (err) {
    return handleApiError(err);
  }
}
