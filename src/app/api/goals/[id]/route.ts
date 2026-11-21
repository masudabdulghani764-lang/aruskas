import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { deleteSavingsGoal, updateSavingsGoal } from "@/lib/goals";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const updateGoalSchema = z.object(
  {
    name: z
      .string({ invalid_type_error: "Nama target tabungan harus berupa teks." })
      .trim()
      .min(1, "Nama target tabungan tidak boleh kosong.")
      .max(80, "Nama target tabungan maksimal 80 karakter.")
      .optional(),
    targetAmount: z
      .number({ invalid_type_error: "Target nominal harus berupa angka." })
      .finite("Target nominal harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const parsed = updateGoalSchema.parse(body);

    const goal = updateSavingsGoal(getDb(), user.id, id, parsed);
    return NextResponse.json({ goal });
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

    deleteSavingsGoal(getDb(), user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
