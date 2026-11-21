import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody } from "@/lib/auth";
import { ingestBcaNotificationByToken } from "@/lib/bca-integration";
import { AppError, handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const webhookPayloadSchema = z.object(
  {
    text: z
      .string({
        required_error: "Isi teks notifikasi BCA wajib dikirim.",
        invalid_type_error: "Isi teks notifikasi BCA harus berupa teks.",
      })
      .trim()
      .min(6, "Isi teks notifikasi BCA terlalu pendek.")
      .max(10_000, "Isi teks notifikasi BCA maksimal 10.000 karakter."),
    subject: z
      .string({ invalid_type_error: "Subjek notifikasi harus berupa teks." })
      .trim()
      .max(300)
      .optional(),
    source: z
      .enum(["webhook_email", "webhook_push"], {
        errorMap: indonesianEnumErrorMap(
          "Sumber webhook wajib dipilih.",
          "Sumber webhook harus webhook_email atau webhook_push."
        ),
      })
      .optional(),
    occurredAt: z
      .string({ invalid_type_error: "Tanggal transaksi harus berupa teks." })
      .trim()
      .optional(),
    externalId: z
      .string({ invalid_type_error: "externalId harus berupa teks." })
      .trim()
      .max(120)
      .optional(),
  },
  { invalid_type_error: "Format data webhook tidak valid." }
);

function extractWebhookToken(request: Request): string {
  const authHeader = request.headers.get("authorization") ?? "";
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }
  const customHeader = request.headers.get("x-aruskas-token");
  if (customHeader) {
    return customHeader.trim();
  }
  const url = new URL(request.url);
  if (url.searchParams.has("token")) {
    throw new AppError(
      400,
      "Demi keamanan, kirim token webhook melalui header Authorization: Bearer <token> atau X-ArusKas-Token, bukan di URL."
    );
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    await enforceRateLimit(db, {
      scope: "bca_webhook",
      identifier: getClientIp(request),
      limit: 60,
      windowMs: 60 * 1000,
      message: "Batas permintaan webhook BCA tercapai. Coba lagi dalam 1 menit.",
    });

    const rawToken = extractWebhookToken(request);
    const rawBody = await parseJsonBody(request);
    const parsed = webhookPayloadSchema.parse(rawBody);

    const result = await ingestBcaNotificationByToken(db, rawToken, parsed);
    return NextResponse.json(result, {
      status: result.status === "imported" ? 201 : 200,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
