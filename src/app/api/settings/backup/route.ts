import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { buildUserBackupJson } from "@/lib/export";
import { getTodayISO } from "@/lib/format";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const today = getTodayISO();
    const backup = await buildUserBackupJson(await getDb(), user);

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="backup-aruskas-${today}.json"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
