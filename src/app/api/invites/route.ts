import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { listPendingInvitesForEmail } from "@/lib/wallets";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const invites = listPendingInvitesForEmail(getDb(), user.email);
    return NextResponse.json({ invites });
  } catch (err) {
    return handleApiError(err);
  }
}
