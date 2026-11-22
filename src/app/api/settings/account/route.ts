import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  clearSessionCookie,
  deleteUserAccount,
  parseJsonBody,
  requireCurrentUser,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

const deleteAccountSchema = z.object({
  confirmText: z
    .string({ required_error: 'Ketik "HAPUS AKUN" untuk konfirmasi.' })
    .trim(),
  currentPassword: z.string().optional(),
});

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const rawBody = await parseJsonBody(request);
    const parsed = deleteAccountSchema.parse(rawBody);

    await deleteUserAccount(db, user.id, parsed);
    await clearSessionCookie();
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
