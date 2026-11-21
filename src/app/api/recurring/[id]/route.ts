import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { deleteRecurringRule, updateRecurringRule } from "@/lib/recurring";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const updateRecurringSchema = z.object(
  {
    walletId: z
      .string({ invalid_type_error: "Dompet harus berupa teks." })
      .trim()
      .min(1, "Dompet wajib dipilih.")
      .optional(),
    categoryId: z
      .string({ invalid_type_error: "Kategori harus berupa teks." })
      .trim()
      .min(1, "Kategori wajib dipilih.")
      .optional(),
    type: z
      .enum(["income", "expense"], {
        errorMap: indonesianEnumErrorMap(
          "Tipe jadwal rutin wajib dipilih.",
          "Tipe jadwal rutin harus pemasukan atau pengeluaran."
        ),
      })
      .optional(),
    amount: z
      .number({ invalid_type_error: "Nominal harus berupa angka." })
      .finite("Nominal harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum.")
      .optional(),
    title: z
      .string({ invalid_type_error: "Judul jadwal rutin harus berupa teks." })
      .trim()
      .min(1, "Judul jadwal rutin wajib diisi.")
      .max(120, "Judul jadwal rutin maksimal 120 karakter.")
      .optional(),
    frequency: z
      .enum(["weekly", "monthly"], {
        errorMap: indonesianEnumErrorMap(
          "Frekuensi jadwal wajib dipilih.",
          "Frekuensi jadwal harus mingguan atau bulanan."
        ),
      })
      .optional(),
    nextRunDate: z
      .string({ invalid_type_error: "Tanggal jatuh tempo harus berupa teks." })
      .trim()
      .regex(
        isoDateRegex,
        "Format tanggal jatuh tempo tidak valid (gunakan YYYY-MM-DD)."
      )
      .optional(),
    isActive: z
      .boolean({ invalid_type_error: "Status aktif harus berupa boolean." })
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
    const parsed = updateRecurringSchema.parse(body);

    const rule = updateRecurringRule(getDb(), id, user.id, parsed);
    return NextResponse.json({ rule });
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

    deleteRecurringRule(getDb(), id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
