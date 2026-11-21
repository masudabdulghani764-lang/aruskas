import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { copyBudgetsFromPreviousMonth } from "@/lib/budgets";
import { handleApiError } from "@/lib/errors";

const copyBudgetsSchema = z.object(
  {
    month: z
      .string({
        required_error: "Bulan tujuan wajib diisi.",
        invalid_type_error: "Bulan tujuan harus berupa teks.",
      })
      .trim()
      .regex(
        /^\d{4}-(0[1-9]|1[0-2])$/,
        "Format bulan tidak valid (gunakan YYYY-MM)."
      ),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = copyBudgetsSchema.parse(body);

    const result = copyBudgetsFromPreviousMonth(
      getDb(),
      user.id,
      parsed.month
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
