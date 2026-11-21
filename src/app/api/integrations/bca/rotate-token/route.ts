import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { rotateBcaWebhookToken } from "@/lib/bca-integration";
import { handleApiError } from "@/lib/errors";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const result = await rotateBcaWebhookToken(db, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
