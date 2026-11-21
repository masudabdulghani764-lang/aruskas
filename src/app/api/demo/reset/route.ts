import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  DEMO_EMAIL,
  createSession,
  requireCurrentUser,
  setSessionCookie,
} from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { resetDemoData } from "@/lib/seed";

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (currentUser.email.toLowerCase() !== DEMO_EMAIL) {
      throw new AppError(403, "Hanya akun demo yang dapat mereset data demo.");
    }

    const db = await getDb();
    const user = await resetDemoData(db);
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
