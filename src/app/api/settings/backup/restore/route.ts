import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { restoreUserBackupJson } from "@/lib/export";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 5 * 1024 * 1024) {
      throw new AppError(400, "Ukuran berkas backup maksimal 5 MB.");
    }

    const body = await parseJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError(400, "Format berkas backup JSON tidak valid.");
    }

    const summary = await restoreUserBackupJson(await getDb(), user.id, body);
    return NextResponse.json({ ok: true, summary }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
