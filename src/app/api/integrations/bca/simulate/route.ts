import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { simulateBcaNotification } from "@/lib/bca-integration";
import { handleApiError } from "@/lib/errors";

const simulateSchema = z.object(
  {
    text: z
      .string({
        required_error: "Teks notifikasi BCA wajib diisi.",
        invalid_type_error: "Teks notifikasi BCA harus berupa teks.",
      })
      .trim()
      .min(6, "Teks notifikasi BCA terlalu pendek.")
      .max(10_000, "Teks notifikasi BCA maksimal 10.000 karakter."),
    subject: z
      .string({ invalid_type_error: "Subjek harus berupa teks." })
      .trim()
      .max(300)
      .optional(),
    walletId: z
      .string({ invalid_type_error: "Dompet tujuan harus berupa teks." })
      .trim()
      .optional(),
    commit: z
      .boolean({ invalid_type_error: "Nilai commit harus berupa boolean." })
      .optional(),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const rawBody = await parseJsonBody(request);
    const parsed = simulateSchema.parse(rawBody);

    const db = getDb();
    const result = simulateBcaNotification(db, user.id, parsed);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
