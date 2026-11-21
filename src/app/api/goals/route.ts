import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { createSavingsGoal, listSavingsGoals } from "@/lib/goals";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createGoalSchema = z.object(
  {
    name: z
      .string({
        required_error: "Nama target tabungan wajib diisi.",
        invalid_type_error: "Nama target tabungan harus berupa teks.",
      })
      .trim()
      .min(1, "Nama target tabungan wajib diisi.")
      .max(80, "Nama target tabungan maksimal 80 karakter."),
    targetAmount: z
      .number({
        required_error: "Target nominal wajib diisi.",
        invalid_type_error: "Target nominal harus berupa angka.",
      })
      .finite("Target nominal harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum."),
    currentAmount: z
      .number({ invalid_type_error: "Saldo terkumpul awal harus berupa angka." })
      .finite("Saldo terkumpul awal harus berupa angka yang valid.")
      .int("Saldo terkumpul awal harus berupa bilangan bulat minimal 0.")
      .min(0, "Saldo terkumpul awal tidak boleh negatif.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum.")
      .optional(),
    walletId: z
      .string({ invalid_type_error: "Dompet harus berupa teks." })
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    deadline: z
      .string({ invalid_type_error: "Tanggal target harus berupa teks." })
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .refine(
        (val) => val === null || val === undefined || isoDateRegex.test(val),
        "Format tanggal target tidak valid (gunakan YYYY-MM-DD)."
      )
      .optional(),
    notes: z
      .string({ invalid_type_error: "Catatan harus berupa teks." })
      .trim()
      .max(500, "Catatan maksimal 500 karakter.")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const goals = listSavingsGoals(getDb(), user.id);
    return NextResponse.json({ goals });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = createGoalSchema.parse(body);

    const goal = createSavingsGoal(getDb(), user.id, parsed);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
