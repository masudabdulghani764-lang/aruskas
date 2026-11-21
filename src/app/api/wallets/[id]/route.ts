import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { indonesianEnumErrorMap, updateWallet } from "@/lib/wallets";

const updateWalletSchema = z.object(
  {
    name: z
      .string({ invalid_type_error: "Nama dompet harus berupa teks." })
      .trim()
      .min(1, "Nama dompet tidak boleh kosong.")
      .max(80, "Nama dompet maksimal 80 karakter.")
      .optional(),
    type: z
      .enum(["cash", "bank", "ewallet", "savings"], {
        errorMap: indonesianEnumErrorMap(
          "Tipe dompet wajib dipilih.",
          "Tipe dompet tidak valid."
        ),
      })
      .optional(),
    archived: z
      .boolean({ invalid_type_error: "Status arsip harus berupa boolean." })
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
    const parsed = updateWalletSchema.parse(body);

    const wallet = await updateWallet(await getDb(), id, user.id, parsed);
    return NextResponse.json({ wallet });
  } catch (err) {
    return handleApiError(err);
  }
}
