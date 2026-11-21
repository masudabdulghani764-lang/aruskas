import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { skipRecurringRule } from "@/lib/recurring";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const rule = skipRecurringRule(getDb(), id, user.id);
    return NextResponse.json({ rule });
  } catch (err) {
    return handleApiError(err);
  }
}
