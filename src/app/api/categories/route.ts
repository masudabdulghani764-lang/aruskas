import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { createCategory, listCategories } from "@/lib/categories";
import { handleApiError } from "@/lib/errors";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const querySchema = z.object({
  type: z
    .enum(["income", "expense"], {
      errorMap: indonesianEnumErrorMap(
        "Tipe kategori wajib dipilih.",
        "Tipe kategori harus pemasukan atau pengeluaran."
      ),
    })
    .optional(),
  ownerId: z
    .string({ invalid_type_error: "ID pemilik harus berupa teks." })
    .trim()
    .min(1, "ID pemilik tidak valid.")
    .optional(),
});

const createCategorySchema = z.object(
  {
    name: z
      .string({
        required_error: "Nama kategori wajib diisi.",
        invalid_type_error: "Nama kategori harus berupa teks.",
      })
      .trim()
      .min(1, "Nama kategori wajib diisi.")
      .max(60, "Nama kategori maksimal 60 karakter."),
    type: z.enum(["income", "expense"], {
      errorMap: indonesianEnumErrorMap(
        "Tipe kategori wajib dipilih.",
        "Tipe kategori harus pemasukan atau pengeluaran."
      ),
    }),
    icon: z
      .string({ invalid_type_error: "Ikon kategori harus berupa teks." })
      .trim()
      .max(40, "Nama ikon maksimal 40 karakter.")
      .transform((val) => (val === "" ? undefined : val))
      .optional(),
    color: z
      .string({ invalid_type_error: "Warna kategori harus berupa teks." })
      .trim()
      .max(32, "Kode warna maksimal 32 karakter.")
      .transform((val) => (val === "" ? undefined : val))
      .optional(),
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

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);

    const parsed = querySchema.parse({
      type: optParam(searchParams.get("type")),
      ownerId: optParam(searchParams.get("ownerId")),
    });

    const categories = listCategories(getDb(), user.id, parsed);
    return NextResponse.json({ categories });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = createCategorySchema.parse(body);

    const category = createCategory(getDb(), user.id, parsed);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
