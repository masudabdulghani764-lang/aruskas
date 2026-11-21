import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  indonesianEnumErrorMap,
  removeWalletMember,
  updateWalletMemberRole,
} from "@/lib/wallets";

const updateRoleSchema = z.object(
  {
    role: z.enum(["editor", "viewer"], {
      errorMap: indonesianEnumErrorMap(
        "Peran anggota wajib dipilih.",
        "Peran anggota harus editor atau viewer."
      ),
    }),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id, userId } = await context.params;
    const body = await parseJsonBody(request);
    const parsed = updateRoleSchema.parse(body);

    const updated = await updateWalletMemberRole(
      await getDb(),
      id,
      user.id,
      userId,
      parsed.role
    );
    return NextResponse.json({ member: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

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
