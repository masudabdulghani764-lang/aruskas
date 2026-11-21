import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { applyRecurringRule } from "@/lib/recurring";

const applyRecurringSchema = z.object(
  {
    amount: z
      .number({ invalid_type_error: "Nominal harus berupa angka." })
      .finite("Nominal harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum.")
      .optional(),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const rawText = await request.text();
    let rawBody: unknown = {};
    if (rawText.trim() !== "") {
      try {
        rawBody = JSON.parse(rawText);
      } catch {
        throw new AppError(400, "Format data permintaan tidak valid.");
      }
    }

    const parsed = applyRecurringSchema.parse(rawBody);
    const transaction = await applyRecurringRule(
      await getDb(),
      id,
      user.id,
      parsed.amount
    );
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
