import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { handleApiError } from "@/lib/errors";
import { getInviteByToken, maskInviteEmail } from "@/lib/wallets";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const invite = await getInviteByToken(await getDb(), token);

    return NextResponse.json({
      invite: {
        id: invite.id,
        walletId: invite.walletId,
        walletName: invite.walletName,
        inviterName: invite.inviterName,
        role: invite.role,
        emailMasked: maskInviteEmail(invite.email),
        requiresSpecificEmail: invite.email !== null,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
