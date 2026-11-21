import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  createSplitBill,
  createSplitBillSchema,
  listUserSplitBills,
} from "@/lib/split-bills";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const splitBills = await listUserSplitBills(db, user.id);
    return NextResponse.json({ splitBills });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const body = await parseJsonBody(request);
    const parsed = createSplitBillSchema.parse(body);
    const splitBill = await createSplitBill(db, user.id, parsed);
    return NextResponse.json({ splitBill }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
