import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { ingestBcaNotificationByToken } from "@/lib/bca-integration";
import { AppError, handleApiError } from "@/lib/errors";
import { enforceRateLimit, getClientIp } from "@/lib/security";
import { indonesianEnumErrorMap } from "@/lib/wallets";

const webhookPayloadSchema = z.object(
  {
    text: z
      .string({
        required_error: "Isi teks notifikasi wajib dikirim.",
        invalid_type_error: "Isi teks notifikasi harus berupa teks.",
      })
      .trim()
      .min(3, "Isi teks notifikasi terlalu pendek.")
      .max(10_000, "Isi teks notifikasi maksimal 10.000 karakter."),
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
  const authHeader = (request.headers.get("authorization") ?? "").trim();
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }
  if (/^bca_live_/i.test(authHeader)) {
    return authHeader;
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

function normalizeWebhookObject(obj: Record<string, unknown>): Record<string, unknown> {
  const textCandidate =
    obj.text ?? obj.body ?? obj.message ?? obj.notification ?? obj.content;
  const subjectCandidate = obj.subject ?? obj.title;
  return {
    text: typeof textCandidate === "string" ? textCandidate : undefined,
    subject:
      typeof subjectCandidate === "string" && subjectCandidate.trim()
        ? subjectCandidate.trim()
        : undefined,
    source: obj.source,
    occurredAt: obj.occurredAt,
    externalId: obj.externalId,
  };
}

/**
 * Escapes raw control characters (\n, \r, \t) inside JSON string literals.
 * Android automation apps like MacroDroid often interpolate multi-line
 * bank notifications directly into JSON templates without JSON-escaping them.
 */
function escapeRawControlCharsInJson(raw: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Resiliently parses webhook bodies sent by Gmail Apps Script, MacroDroid,
 * Tasker, or Apple Shortcuts (JSON, multi-line unescaped JSON, form-urlencoded,
 * or plain text).
 */
async function parseWebhookBody(request: Request): Promise<unknown> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const rawText = (await request.text()).trim();
  if (!rawText) {
    throw new AppError(400, "Isi body webhook kosong.");
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawText);
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return normalizeWebhookObject({
      source: "webhook_push",
      ...obj,
    });
  }

  if (contentType.startsWith("text/plain") && !rawText.startsWith("{")) {
    return {
      text: rawText,
      source: "webhook_push",
    };
  }

  if (rawText.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return normalizeWebhookObject(parsed as Record<string, unknown>);
      }
      return parsed;
    } catch {
      try {
        const sanitized = escapeRawControlCharsInJson(rawText);
        const parsed = JSON.parse(sanitized) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return normalizeWebhookObject(parsed as Record<string, unknown>);
        }
      } catch {
        // Fallback when notification body contains unescaped double quotes inside JSON template
        return {
          text: rawText,
          source: "webhook_push",
        };
      }
    }
  }

  // Fallback for raw plain-text notifications without explicit Content-Type header
  return {
    text: rawText,
    source: "webhook_push",
  };
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
    const rawBody = await parseWebhookBody(request);
    const parsed = webhookPayloadSchema.parse(rawBody);

    const result = await ingestBcaNotificationByToken(db, rawToken, parsed);
    return NextResponse.json(result, {
      status: result.status === "imported" ? 201 : 200,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
