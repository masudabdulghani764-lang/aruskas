import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from "@/lib/transactions";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const updateTransactionSchema = z.object(
  {
    walletId: z
      .string({ invalid_type_error: "Dompet asal harus berupa teks." })
      .trim()
      .min(1, "Dompet asal wajib dipilih.")
      .optional(),
    targetWalletId: z
      .string({ invalid_type_error: "Dompet tujuan harus berupa teks." })
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    categoryId: z
      .string({ invalid_type_error: "Kategori harus berupa teks." })
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    type: z
      .enum(["income", "expense", "transfer"], {
        errorMap: indonesianEnumErrorMap(
          "Tipe transaksi wajib dipilih.",
          "Tipe transaksi tidak valid."
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
      .string({ invalid_type_error: "Judul transaksi harus berupa teks." })
      .trim()
      .min(1, "Judul transaksi wajib diisi.")
      .max(120, "Judul transaksi maksimal 120 karakter.")
      .optional(),
    notes: z
      .string({ invalid_type_error: "Catatan harus berupa teks." })
      .trim()
      .max(500, "Catatan maksimal 500 karakter.")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    paymentMethod: z
      .string({ invalid_type_error: "Metode pembayaran harus berupa teks." })
      .trim()
      .max(60, "Metode pembayaran maksimal 60 karakter.")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    occurredAt: z
      .string({ invalid_type_error: "Tanggal transaksi harus berupa teks." })
      .trim()
      .regex(
        isoDateRegex,
        "Format tanggal transaksi tidak valid (gunakan YYYY-MM-DD)."
      )
      .optional(),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const transaction = getTransactionById(getDb(), id, user.id);
    return NextResponse.json({ transaction });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const parsed = updateTransactionSchema.parse(body);

    const transaction = updateTransaction(getDb(), id, user.id, parsed);
    return NextResponse.json({ transaction });
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

    deleteTransaction(getDb(), id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
