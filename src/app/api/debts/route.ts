import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { createDebt, createDebtSchema, listUserDebts } from "@/lib/debts";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const result = await listUserDebts(db, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const rawBody = await parseJsonBody(request);
    const parsed = createDebtSchema.parse(rawBody);
    const debt = await createDebt(db, user.id, parsed);
    return NextResponse.json({ debt }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
