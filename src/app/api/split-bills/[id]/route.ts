import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  deleteSplitBill,
  toggleParticipantPaidSchema,
  toggleSplitBillParticipantPaid,
} from "@/lib/split-bills";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const db = await getDb();
    const body = await parseJsonBody(request);
    const parsed = toggleParticipantPaidSchema.parse(body);
    const splitBill = await toggleSplitBillParticipantPaid(
      db,
      user.id,
      id,
      parsed.participantId,
      parsed.isPaid
    );
    return NextResponse.json({ splitBill });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const db = await getDb();
    await deleteSplitBill(db, user.id, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
