import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { deleteCategory, updateCategory } from "@/lib/categories";
import { handleApiError } from "@/lib/errors";

const updateCategorySchema = z.object(
  {
    name: z
      .string({ invalid_type_error: "Nama kategori harus berupa teks." })
      .trim()
      .min(1, "Nama kategori tidak boleh kosong.")
      .max(60, "Nama kategori maksimal 60 karakter.")
      .optional(),
    icon: z
      .string({ invalid_type_error: "Ikon kategori harus berupa teks." })
      .trim()
      .min(1, "Ikon kategori tidak boleh kosong.")
      .max(40, "Nama ikon maksimal 40 karakter.")
      .optional(),
    color: z
      .string({ invalid_type_error: "Warna kategori harus berupa teks." })
      .trim()
      .min(1, "Warna kategori tidak boleh kosong.")
      .max(32, "Kode warna maksimal 32 karakter.")
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
    const parsed = updateCategorySchema.parse(body);

    const category = await updateCategory(await getDb(), user.id, id, parsed);
    return NextResponse.json({ category });
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

    await deleteCategory(await getDb(), user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
