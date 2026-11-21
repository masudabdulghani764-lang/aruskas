import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { acceptWalletInvite } from "@/lib/wallets";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { token } = await context.params;

    const result = acceptWalletInvite(getDb(), token, user);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
