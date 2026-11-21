import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  createWallet,
  indonesianEnumErrorMap,
  listUserWallets,
} from "@/lib/wallets";

const createWalletSchema = z.object(
  {
    name: z
      .string({
        required_error: "Nama dompet wajib diisi.",
        invalid_type_error: "Nama dompet harus berupa teks.",
      })
      .trim()
      .min(1, "Nama dompet wajib diisi.")
      .max(80, "Nama dompet maksimal 80 karakter."),
    type: z.enum(["cash", "bank", "ewallet", "savings"], {
      errorMap: indonesianEnumErrorMap(
        "Tipe dompet wajib dipilih.",
        "Tipe dompet tidak valid."
      ),
    }),
    initialBalance: z
      .number({
        required_error: "Saldo awal wajib diisi.",
        invalid_type_error: "Saldo awal harus berupa angka.",
      })
      .finite("Saldo awal harus berupa angka yang valid.")
      .int("Saldo awal harus berupa bilangan bulat.")
      .min(0, "Saldo awal tidak boleh negatif.")
      .max(Number.MAX_SAFE_INTEGER, "Saldo awal melebihi batas maksimum."),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const wallets = await listUserWallets(await getDb(), user.id, {
      includeArchived,
    });
    return NextResponse.json({ wallets });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = createWalletSchema.parse(body);

    const wallet = await createWallet(await getDb(), user.id, parsed);
    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
