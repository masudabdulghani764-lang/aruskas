import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { depositToSavingsGoal } from "@/lib/goals";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const depositGoalSchema = z.object(
  {
    amount: z
      .number({
        required_error: "Nominal setoran wajib diisi.",
        invalid_type_error: "Nominal setoran harus berupa angka.",
      })
      .finite("Nominal setoran harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum."),
    mode: z.enum(["wallet_transfer", "virtual"], {
      errorMap: indonesianEnumErrorMap(
        "Mode setoran wajib dipilih.",
        "Mode setoran harus wallet_transfer atau virtual."
      ),
    }),
    sourceWalletId: z
      .string({ invalid_type_error: "Dompet asal harus berupa teks." })
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    occurredAt: z
      .string({ invalid_type_error: "Tanggal setoran harus berupa teks." })
      .trim()
      .transform((val) => (val === "" ? undefined : val))
      .refine(
        (val) => val === undefined || isoDateRegex.test(val),
        "Format tanggal setoran tidak valid (gunakan YYYY-MM-DD)."
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const parsed = depositGoalSchema.parse(body);

    const goal = depositToSavingsGoal(getDb(), user.id, id, parsed);
    return NextResponse.json({ goal });
  } catch (err) {
    return handleApiError(err);
  }
}
