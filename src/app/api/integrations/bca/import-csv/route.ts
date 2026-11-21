import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import {
  commitBcaCsvImport,
  previewBcaCsvImport,
} from "@/lib/bca-integration";
import { handleApiError } from "@/lib/errors";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const previewSchema = z.object(
  {
    action: z.literal("preview"),
    walletId: z
      .string({
        required_error: "Dompet tujuan wajib dipilih.",
        invalid_type_error: "Dompet tujuan harus berupa teks.",
      })
      .trim()
      .min(1, "Dompet tujuan wajib dipilih."),
    csvText: z
      .string({
        required_error: "Isi file CSV BCA wajib diisi.",
        invalid_type_error: "Isi file CSV BCA harus berupa teks.",
      })
      .min(10, "Isi file CSV terlalu pendek.")
      .max(2_000_000, "Ukuran teks CSV maksimal 2MB."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

const commitRowSchema = z.object({
  type: z.enum(["income", "expense"], {
    errorMap: indonesianEnumErrorMap(
      "Tipe transaksi wajib dipilih.",
      "Tipe transaksi harus income atau expense."
    ),
  }),
  amount: z
    .number({
      required_error: "Nominal wajib diisi.",
      invalid_type_error: "Nominal harus berupa angka.",
    })
    .finite("Nominal tidak valid.")
    .int("Nominal harus bilangan bulat.")
    .positive("Nominal harus lebih dari 0.")
    .max(Number.MAX_SAFE_INTEGER, "Nominal terlalu besar."),
  title: z
    .string({
      required_error: "Judul transaksi wajib diisi.",
      invalid_type_error: "Judul transaksi harus berupa teks.",
    })
    .trim()
    .min(1, "Judul transaksi wajib diisi.")
    .max(120),
  occurredAt: z
    .string({
      required_error: "Tanggal transaksi wajib diisi.",
      invalid_type_error: "Tanggal transaksi harus berupa teks.",
    })
    .trim(),
  paymentMethod: z.string().trim().max(80),
  notes: z.string().trim().max(500),
  dedupeKey: z.string().trim().min(1).max(300),
  categoryId: z
    .string({
      required_error: "Kategori wajib dipilih.",
      invalid_type_error: "Kategori harus berupa teks.",
    })
    .trim()
    .min(1, "Kategori wajib dipilih."),
});

const commitSchema = z.object(
  {
    action: z.literal("commit"),
    walletId: z
      .string({
        required_error: "Dompet tujuan wajib dipilih.",
        invalid_type_error: "Dompet tujuan harus berupa teks.",
      })
      .trim()
      .min(1, "Dompet tujuan wajib dipilih."),
    rows: z
      .array(commitRowSchema, {
        required_error: "Daftar transaksi wajib diisi.",
        invalid_type_error: "Daftar transaksi harus berupa array.",
      })
      .min(1, "Pilih minimal satu transaksi untuk diimpor.")
      .max(500, "Maksimal 500 transaksi per impor."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const rawBody = await parseJsonBody(request);

    const action =
      rawBody && typeof rawBody === "object" && "action" in rawBody
        ? (rawBody as { action?: unknown }).action
        : null;

    const db = getDb();

    if (action === "preview") {
      const parsed = previewSchema.parse(rawBody);
      const preview = previewBcaCsvImport(db, user.id, {
        walletId: parsed.walletId,
        csvText: parsed.csvText,
      });
      return NextResponse.json(preview);
    }

    if (action === "commit") {
      const parsed = commitSchema.parse(rawBody);
      const result = commitBcaCsvImport(db, user.id, {
        walletId: parsed.walletId,
        rows: parsed.rows,
      });
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json(
      { error: "Aksi tidak valid. Gunakan preview atau commit." },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
