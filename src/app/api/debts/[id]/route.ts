import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import {
  deleteDebt,
  recordDebtPayment,
  recordDebtPaymentSchema,
} from "@/lib/debts";
import { handleApiError } from "@/lib/errors";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const db = await getDb();
    const rawBody = await parseJsonBody(request);
    const parsed = recordDebtPaymentSchema.parse(rawBody);
    const debt = await recordDebtPayment(db, user.id, id, parsed);
    return NextResponse.json({ debt });
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
    await deleteDebt(db, user.id, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
