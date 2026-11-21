import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { removeWalletMember } from "@/lib/wallets";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id, userId } = await context.params;

    await removeWalletMember(await getDb(), id, user.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
