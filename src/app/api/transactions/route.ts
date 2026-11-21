import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { deleteAttachmentQuietly, saveAttachment } from "@/lib/attachments";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import {
  assertValidIsoDate,
  createTransaction,
  listTransactions,
} from "@/lib/transactions";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  from: z
    .string()
    .regex(isoDateRegex, "Format tanggal awal tidak valid (gunakan YYYY-MM-DD).")
    .optional(),
  to: z
    .string()
    .regex(isoDateRegex, "Format tanggal akhir tidak valid (gunakan YYYY-MM-DD).")
    .optional(),
  type: z
    .enum(["income", "expense", "transfer", "all"], {
      errorMap: indonesianEnumErrorMap(
        "Tipe transaksi wajib dipilih.",
        "Tipe transaksi tidak valid."
      ),
    })
    .optional(),
  walletId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  search: z.string().optional(),
  limit: z
    .number({ invalid_type_error: "Batas jumlah data harus berupa angka." })
    .int("Batas jumlah data harus berupa bilangan bulat.")
    .min(1, "Batas jumlah data minimal 1.")
    .max(500, "Batas jumlah data maksimal 500.")
    .optional(),
  offset: z
    .number({ invalid_type_error: "Offset data harus berupa angka." })
    .int("Offset data harus berupa bilangan bulat.")
    .min(0, "Offset data tidak boleh negatif.")
    .optional(),
});

const createTransactionSchema = z.object(
  {
    walletId: z
      .string({
        required_error: "Dompet asal wajib dipilih.",
        invalid_type_error: "Dompet asal harus berupa teks.",
      })
      .trim()
      .min(1, "Dompet asal wajib dipilih."),
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
    type: z.enum(["income", "expense", "transfer"], {
      errorMap: indonesianEnumErrorMap(
        "Tipe transaksi wajib dipilih.",
        "Tipe transaksi tidak valid."
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
        required_error: "Judul transaksi wajib diisi.",
        invalid_type_error: "Judul transaksi harus berupa teks.",
      })
      .trim()
      .min(1, "Judul transaksi wajib diisi.")
      .max(120, "Judul transaksi maksimal 120 karakter."),
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
      .string({
        required_error: "Tanggal transaksi wajib diisi.",
        invalid_type_error: "Tanggal transaksi harus berupa teks.",
      })
      .trim()
      .regex(
        isoDateRegex,
        "Format tanggal transaksi tidak valid (gunakan YYYY-MM-DD)."
      ),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

function optParam(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optIntParam(value: string | null): number | undefined {
  const str = optParam(value);
  if (str === undefined) {
    return undefined;
  }
  return Number(str);
}

function getFormString(
  formData: FormData,
  key: string
): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);

    const parsed = querySchema.parse({
      from: optParam(searchParams.get("from")),
      to: optParam(searchParams.get("to")),
      type: optParam(searchParams.get("type")),
      walletId: optParam(searchParams.get("walletId")),
      categoryId: optParam(searchParams.get("categoryId")),
      search: optParam(searchParams.get("search")),
      limit: optIntParam(searchParams.get("limit")),
      offset: optIntParam(searchParams.get("offset")),
    });

    if (parsed.from) {
      assertValidIsoDate(parsed.from);
    }
    if (parsed.to) {
      assertValidIsoDate(parsed.to);
    }

    const result = listTransactions(getDb(), user.id, parsed);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.toLowerCase().includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        throw new AppError(400, "Format data formulir tidak valid.");
      }

      const rawAmount = getFormString(formData, "amount");
      const parsedAmount =
        rawAmount === undefined || rawAmount.trim() === ""
          ? undefined
          : Number(rawAmount.trim());

      const parsed = createTransactionSchema.parse({
        walletId: getFormString(formData, "walletId"),
        targetWalletId: getFormString(formData, "targetWalletId") ?? null,
        categoryId: getFormString(formData, "categoryId") ?? null,
        type: getFormString(formData, "type")?.trim() || undefined,
        amount: parsedAmount,
        title: getFormString(formData, "title"),
        notes: getFormString(formData, "notes") ?? null,
        paymentMethod: getFormString(formData, "paymentMethod") ?? null,
        occurredAt: getFormString(formData, "occurredAt"),
      });

      const fileEntry = formData.get("attachment");
      let savedAttachment: { path: string; name: string; mime: string } | null =
        null;

      if (
        fileEntry &&
        typeof fileEntry !== "string" &&
        (fileEntry.size > 0 || fileEntry.name !== "")
      ) {
        const buffer = new Uint8Array(await fileEntry.arrayBuffer());
        savedAttachment = await saveAttachment({
          name: fileEntry.name || "lampiran",
          type: fileEntry.type || "application/octet-stream",
          buffer,
        });
      }

      try {
        const transaction = createTransaction(getDb(), user.id, {
          ...parsed,
          ...(savedAttachment
            ? {
                attachmentPath: savedAttachment.path,
                attachmentName: savedAttachment.name,
                attachmentMime: savedAttachment.mime,
              }
            : {}),
        });
        return NextResponse.json({ transaction }, { status: 201 });
      } catch (err) {
        if (savedAttachment) {
          await deleteAttachmentQuietly(savedAttachment.path);
        }
        throw err;
      }
    }

    const body = await parseJsonBody(request);
    const parsed = createTransactionSchema.parse(body);
    const transaction = createTransaction(getDb(), user.id, parsed);
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
