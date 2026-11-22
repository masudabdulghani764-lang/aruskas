import crypto from "node:crypto";

export {
  SUPPORTED_BANK_PROVIDERS,
  extractBcaDate,
  parseBcaAmount,
  parseBcaCsv,
  parseBcaNotification,
  suggestBcaCategoryId,
  type ParsedBcaCsvResult,
  type ParsedBcaEntry,
} from "@/lib/bank-notification-parser";

export function buildBcaDedupeHash(
  walletId: string,
  entry: {
    type: "income" | "expense";
    amount: number;
    occurredAt: string;
    dedupeKey: string;
  }
): string {
  const canonical = [
    walletId,
    entry.type,
    String(entry.amount),
    entry.occurredAt,
    entry.dedupeKey.toLowerCase().replace(/\s+/g, " ").trim(),
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
