import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { listUserSecurityEvents } from "@/lib/audit-log";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    const db = await getDb();

    const [[userRow], logs] = await Promise.all([
      db
        .select({
          totpEnabled: users.totpEnabled,
          googleSub: users.googleSub,
        })
        .from(users)
        .where(eq(users.id, currentUser.id))
        .limit(1),
      listUserSecurityEvents(db, currentUser.id, 20),
    ]);

    return NextResponse.json({
      totpEnabled: Boolean(userRow?.totpEnabled),
      isGoogleOnly: Boolean(userRow?.googleSub),
      logs,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
