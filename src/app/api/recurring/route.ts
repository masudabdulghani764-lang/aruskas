import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  createRecurringRule,
  listDueRecurringRules,
  listRecurringRules,
} from "@/lib/recurring";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createRecurringSchema = z.object(
  {
    walletId: z
      .string({
        required_error: "Dompet wajib dipilih.",
        invalid_type_error: "Dompet harus berupa teks.",
      })
      .trim()
      .min(1, "Dompet wajib dipilih."),
    categoryId: z
      .string({
        required_error: "Kategori wajib dipilih.",
        invalid_type_error: "Kategori harus berupa teks.",
      })
      .trim()
      .min(1, "Kategori wajib dipilih."),
    type: z.enum(["income", "expense"], {
      errorMap: indonesianEnumErrorMap(
        "Tipe jadwal rutin wajib dipilih.",
        "Tipe jadwal rutin harus pemasukan atau pengeluaran."
      ),
    }),
    amount: z
      .number({
        required_error: "Nominal wajib diisi.",
        invalid_type_error: "Nominal harus berupa angka.",
      })
      .finite("Nominal harus berupa angka yang valid.")
      .int("Nominal harus berupa bilangan bulat lebih dari 0.")
      .positive("Nominal harus berupa bilangan bulat lebih dari 0.")
      .max(Number.MAX_SAFE_INTEGER, "Nominal melebihi batas maksimum."),
    title: z
      .string({
        required_error: "Judul jadwal rutin wajib diisi.",
        invalid_type_error: "Judul jadwal rutin harus berupa teks.",
      })
      .trim()
      .min(1, "Judul jadwal rutin wajib diisi.")
      .max(120, "Judul jadwal rutin maksimal 120 karakter."),
    frequency: z.enum(["weekly", "monthly"], {
      errorMap: indonesianEnumErrorMap(
        "Frekuensi jadwal wajib dipilih.",
        "Frekuensi jadwal harus mingguan atau bulanan."
      ),
    }),
    nextRunDate: z
      .string({
        required_error: "Tanggal jatuh tempo berikutnya wajib diisi.",
        invalid_type_error: "Tanggal jatuh tempo harus berupa teks.",
      })
      .trim()
      .regex(
        isoDateRegex,
        "Format tanggal jatuh tempo tidak valid (gunakan YYYY-MM-DD)."
      ),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const dueOnly = searchParams.get("dueOnly") === "true";

    const rules = dueOnly
      ? listDueRecurringRules(getDb(), user.id)
      : listRecurringRules(getDb(), user.id);

    return NextResponse.json({ rules });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = createRecurringSchema.parse(body);

    const rule = createRecurringRule(getDb(), user.id, parsed);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
