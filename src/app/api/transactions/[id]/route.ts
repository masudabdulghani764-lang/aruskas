import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  deleteAttachmentQuietly,
  prepareAttachmentForDb,
} from "@/lib/attachments";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import {
  deleteTransaction,
  getTransactionById,
  updateTransaction,
  type UpdateTransactionInput,
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
    removeAttachment: z.boolean().optional(),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

function formStr(formData: FormData, key: string): string | undefined {
  const val = formData.get(key);
  if (typeof val !== "string") {
    return undefined;
  }
  return val;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const transaction = await getTransactionById(await getDb(), id, user.id);
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
    const contentType = request.headers.get("content-type") ?? "";

    let updateInput: UpdateTransactionInput;

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        throw new AppError(400, "Format form-data tidak valid.");
      }

      const rawAmountStr = formStr(formData, "amount");
      const rawAmount =
        rawAmountStr !== undefined && rawAmountStr.trim() !== ""
          ? Number(rawAmountStr.trim())
          : undefined;

      const parsed = updateTransactionSchema.parse({
        walletId: formStr(formData, "walletId"),
        targetWalletId: formStr(formData, "targetWalletId"),
        categoryId: formStr(formData, "categoryId"),
        type: formStr(formData, "type"),
        amount: rawAmount,
        title: formStr(formData, "title"),
        notes: formStr(formData, "notes"),
        paymentMethod: formStr(formData, "paymentMethod"),
        occurredAt: formStr(formData, "occurredAt"),
        removeAttachment: formStr(formData, "removeAttachment") === "true",
      });

      const { removeAttachment, ...rest } = parsed;
      updateInput = { ...rest };

      const fileEntry = formData.get("attachment");
      if (fileEntry instanceof File && fileEntry.size > 0) {
        const buffer = new Uint8Array(await fileEntry.arrayBuffer());
        const saved = prepareAttachmentForDb({
          name: fileEntry.name,
          type: fileEntry.type,
          buffer,
        });
        updateInput.attachmentPath = saved.path;
        updateInput.attachmentName = saved.name;
        updateInput.attachmentMime = saved.mime;
        updateInput.attachmentData = saved.dataBase64;
      } else if (removeAttachment) {
        updateInput.attachmentPath = null;
        updateInput.attachmentName = null;
        updateInput.attachmentMime = null;
        updateInput.attachmentData = null;
      }
    } else {
      const body = await parseJsonBody(request);
      const parsed = updateTransactionSchema.parse(body);
      const { removeAttachment, ...rest } = parsed;
      updateInput = { ...rest };
      if (removeAttachment) {
        updateInput.attachmentPath = null;
        updateInput.attachmentName = null;
        updateInput.attachmentMime = null;
        updateInput.attachmentData = null;
      }
    }

    const transaction = await updateTransaction(
      await getDb(),
      id,
      user.id,
      updateInput
    );
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

    const deleted = await deleteTransaction(await getDb(), id, user.id);
    if (deleted.attachmentPath) {
      await deleteAttachmentQuietly(deleted.attachmentPath);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
