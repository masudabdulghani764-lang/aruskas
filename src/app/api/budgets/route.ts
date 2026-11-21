import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { listMonthlyBudgets, upsertBudget } from "@/lib/budgets";
import { handleApiError } from "@/lib/errors";
import { getCurrentMonthYM } from "@/lib/format";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

const querySchema = z.object({
  month: z
    .string({ invalid_type_error: "Bulan anggaran harus berupa teks." })
    .trim()
    .regex(monthRegex, "Format bulan tidak valid (gunakan YYYY-MM).")
    .optional(),
});

const upsertBudgetSchema = z.object(
  {
    categoryId: z
      .string({
        required_error: "Kategori wajib dipilih.",
        invalid_type_error: "Kategori harus berupa teks.",
      })
      .trim()
      .min(1, "Kategori wajib dipilih."),
    month: z
      .string({
        required_error: "Bulan anggaran wajib diisi.",
        invalid_type_error: "Bulan anggaran harus berupa teks.",
      })
      .trim()
      .regex(monthRegex, "Format bulan tidak valid (gunakan YYYY-MM)."),
    limitAmount: z
      .number({
        required_error: "Batas anggaran wajib diisi.",
        invalid_type_error: "Batas anggaran harus berupa angka.",
      })
      .finite("Batas anggaran harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const rawMonth = searchParams.get("month")?.trim();

    const parsed = querySchema.parse({
      month: rawMonth || undefined,
    });
    const month = parsed.month ?? getCurrentMonthYM();

    const budgets = listMonthlyBudgets(getDb(), user.id, month);
    return NextResponse.json({ month, budgets });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = upsertBudgetSchema.parse(body);

    const budget = upsertBudget(getDb(), user.id, parsed);
    return NextResponse.json({ budget });
  } catch (err) {
    return handleApiError(err);
  }
}
