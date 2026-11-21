import crypto from "node:crypto";
import { getTodayISO } from "@/lib/format";

export type ParsedBcaEntry = {
  type: "income" | "expense";
  amount: number;
  title: string;
  occurredAt: string;
  paymentMethod: string;
  notes: string;
  dedupeKey: string;
  providerName?: string;
};

export const SUPPORTED_BANK_PROVIDERS = [
  { id: "bca", label: "BCA / myBCA", kind: "bank" },
  { id: "mandiri", label: "Livin' Mandiri", kind: "bank" },
  { id: "bri", label: "BRImo (BRI)", kind: "bank" },
  { id: "bni", label: "Wondr / BNI", kind: "bank" },
  { id: "blu", label: "blu by BCA", kind: "bank" },
  { id: "jago", label: "Bank Jago", kind: "bank" },
  { id: "seabank", label: "SeaBank", kind: "bank" },
  { id: "bsi", label: "BYOND / BSI", kind: "bank" },
  { id: "gopay", label: "GoPay", kind: "ewallet" },
  { id: "shopeepay", label: "ShopeePay", kind: "ewallet" },
  { id: "ovo", label: "OVO", kind: "ewallet" },
  { id: "dana", label: "DANA", kind: "ewallet" },
] as const;

type DetectedProvider = {
  id: string;
  label: string;
  isEwallet: boolean;
};

function detectBankOrEwalletProvider(text: string): DetectedProvider {
  const lower = text.toLowerCase();
  if (/\b(?:blu\s*by\s*bca|blubca|bluaccount)\b/i.test(lower)) {
    return { id: "blu", label: "blu", isEwallet: false };
  }
  if (/\b(?:livin|mandiri)\b/i.test(lower)) {
    return { id: "mandiri", label: "Mandiri", isEwallet: false };
  }
  if (/\b(?:brimo|bank\s*bri|\bbri\b)\b/i.test(lower)) {
    return { id: "bri", label: "BRI", isEwallet: false };
  }
  if (/\b(?:wondr|bni\s*mobile|bank\s*bni|\bbni\b)\b/i.test(lower)) {
    return { id: "bni", label: "BNI", isEwallet: false };
  }
  if (/\b(?:bank\s*jago|\bjago\b)\b/i.test(lower)) {
    return { id: "jago", label: "Bank Jago", isEwallet: false };
  }
  if (/\bseabank\b/i.test(lower)) {
    return { id: "seabank", label: "SeaBank", isEwallet: false };
  }
  if (/\b(?:byond|bsi\s*mobile|bank\s*syariah\s*indonesia|\bbsi\b)\b/i.test(lower)) {
    return { id: "bsi", label: "BSI", isEwallet: false };
  }
  if (/\b(?:gopay|go-?pay)\b/i.test(lower)) {
    return { id: "gopay", label: "GoPay", isEwallet: true };
  }
  if (/\b(?:shopeepay|spay)\b/i.test(lower)) {
    return { id: "shopeepay", label: "ShopeePay", isEwallet: true };
  }
  if (/\bovo\b/i.test(lower)) {
    return { id: "ovo", label: "OVO", isEwallet: true };
  }
  if (/\b(?:dana\s*id|saldo\s*dana|kirim\s*dana|bayar\s*(?:pakai|dengan|via)\s*dana|notifikasi\s*dana|\bdana\b(?=\s+(?:berhasil|qris|saldo|transfer)))\b/i.test(lower)) {
    return { id: "dana", label: "DANA", isEwallet: true };
  }
  return { id: "bca", label: "BCA", isEwallet: false };
}

export type ParsedBcaCsvResult = {
  entries: ParsedBcaEntry[];
  skippedPending: number;
  skippedInvalid: number;
  detectedPeriod: string | null;
};

const ID_MONTHS: Record<string, string> = {
  jan: "01",
  januari: "01",
  feb: "02",
  februari: "02",
  mar: "03",
  maret: "03",
  apr: "04",
  april: "04",
  mei: "05",
  may: "05",
  jun: "06",
  juni: "06",
  jul: "07",
  juli: "07",
  agu: "08",
  ags: "08",
  agustus: "08",
  aug: "08",
  sep: "09",
  sept: "09",
  september: "09",
  okt: "10",
  oktober: "10",
  oct: "10",
  nov: "11",
  november: "11",
  des: "12",
  desember: "12",
  dec: "12",
};

/**
 * Parses Indonesian (`1.250.000,00`) and English/KlikBCA (`1,250,000.00`)
 * Rupiah number strings into a positive integer Rupiah amount.
 */
export function parseBcaAmount(raw: string): number | null {
  const cleaned = raw.replace(/^(?:Rp|IDR)\.?\s*/i, "").trim();
  if (!cleaned) {
    return null;
  }

  let normalized = cleaned.replace(/\s+/g, "");
  // Strip leading sign if any
  normalized = normalized.replace(/^[+-]/, "");

  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot && hasComma) {
    const lastDot = normalized.lastIndexOf(".");
    const lastComma = normalized.lastIndexOf(",");
    if (lastComma > lastDot) {
      // Indonesian: 1.250.000,00
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      // English/KlikBCA: 1,250,000.00
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Check if comma is decimal (e.g. 25000,00) vs thousands (25,000)
    const parts = normalized.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasDot) {
    // Check if dot is decimal (e.g. 25000.00) vs thousands (25.000 or 1.250.000)
    const parts = normalized.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      // decimal dot
    } else {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  const rounded = Math.round(num);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) {
    return null;
  }
  return rounded;
}

function isValidYMD(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidYMD(year, month, day)) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Extracts a `YYYY-MM-DD` date from Indonesian/BCA notification text if present.
 */
export function extractBcaDate(text: string, fallbackDate?: string): string {
  // 1. YYYY-MM-DD
  const isoMatch = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (isoMatch) {
    const parsed = toIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
    if (parsed) return parsed;
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/.exec(text);
  if (dmyMatch) {
    const parsed = toIsoDate(
      Number(dmyMatch[3]),
      Number(dmyMatch[2]),
      Number(dmyMatch[1])
    );
    if (parsed) return parsed;
  }

  // 3. DD Mon YYYY (e.g. 21 Nov 2026 / 21 November 2026)
  const wordMatch = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/.exec(text);
  if (wordMatch) {
    const monthStr = ID_MONTHS[wordMatch[2].toLowerCase()];
    if (monthStr) {
      const parsed = toIsoDate(
        Number(wordMatch[3]),
        Number(monthStr),
        Number(wordMatch[1])
      );
      if (parsed) return parsed;
    }
  }

  return fallbackDate ?? getTodayISO();
}

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

function cleanEntity(raw: string): string {
  return raw
    .replace(/\b(?:sebesar|senilai|berhasil|sukses|pada|tanggal|ke rekening|di rekening|via|dengan|ref|no\.?\s*ref)\b.*$/i, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+|[:\-\s.,]+$/g, "")
    .trim()
    .slice(0, 64);
}

/**
 * Parses real-world myBCA, m-BCA, and KlikBCA email or mobile push notification text.
 */
export function parseBcaNotification(
  rawText: string,
  opts?: { subject?: string; fallbackDate?: string; externalId?: string }
): ParsedBcaEntry | null {
  const combined = [opts?.subject?.trim(), rawText.trim()]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!combined || combined.length < 6) {
    return null;
  }

  const lower = combined.toLowerCase();

  // Extract Rupiah amount (prioritize explicit Rp / IDR prefix)
  const currencyRegex =
    /(?:Rp\.?|IDR)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/i;
  const amountMatch = currencyRegex.exec(combined);
  if (!amountMatch) {
    return null;
  }

  const amount = parseBcaAmount(amountMatch[1]);
  if (!amount) {
    return null;
  }

  // Detect Indonesian bank or e-wallet provider (defaults to BCA for backward compatibility)
  const provider = detectBankOrEwalletProvider(combined);

  // Determine direction (income vs expense)
  const incomePatterns = [
    /\b(?:menerima\s+transfer|transfer\s+masuk|dana\s+masuk|uang\s+masuk|saldo\s+masuk|bi-?fast\s+masuk|kredit|setoran\s+masuk|pemasukan|credit|kamu\s+terima|berhasil\s+masuk|terima\s+uang|transfer\s+diterima|diterima\s+dari|cashback|isi\s+saldo\s+berhasil|top\s*up\s+(?:saldo\s+)?berhasil(?:\s+masuk|\s+sebesar)?)\b/i,
    /\bCR\b/,
  ];
  const expensePatterns = [
    /\b(?:transfer\s+ke|transfer\s+keluar|pembayaran|bayar|qris|virtual\s+account|\bva\b|debit|debet|tarik\s+tunai|pembelian|beli|top\s*up\s+(?:ke|pulsa|e-?wallet|gopay|ovo|dana|shopeepay|flazz|emoney)|tagihan|pengeluaran|m-?transfer\s+berhasil|transaksi\s+berhasil\s+di|kamu\s+bayar|berhasil\s+dikirim\s+ke|kirim\s+uang\s+ke|transaksi\s+keluar|terpotong)\b/i,
    /\bDB\b/,
  ];

  const isIncome = incomePatterns.some((re) => re.test(combined));
  const isExpense = expensePatterns.some((re) => re.test(combined));

  let type: "income" | "expense";
  if (isIncome && !isExpense) {
    type = "income";
  } else if (isExpense && !isIncome) {
    type = "expense";
  } else if (isIncome && isExpense) {
    // Disambiguate when subject says "Transaksi Berhasil" and body says "menerima transfer"
    type =
      /\b(?:menerima|masuk|kamu\s+terima|diterima\s+dari|dari\s+[A-Z]|CR)\b/i.test(
        combined
      ) &&
      !/\b(?:qris|virtual\s+account|pembayaran|tarik\s+tunai|transfer\s+ke|kamu\s+bayar|berhasil\s+dikirim\s+ke)\b/i.test(
        combined
      )
        ? "income"
        : "expense";
  } else {
    return null;
  }

  // Detect payment method (provider-aware while preserving exact BCA labels)
  const pLabel = provider.label;
  let paymentMethod = provider.isEwallet ? pLabel : `Transfer ${pLabel}`;
  if (/qris/i.test(lower)) {
    paymentMethod = `QRIS ${pLabel}`;
  } else if (/virtual\s+account|\bbca\s+va\b|\bbriva\b|\bmandiri\s+va\b|\bva\b/i.test(lower)) {
    paymentMethod = `Virtual Account ${pLabel}`;
  } else if (/bi-?fast/i.test(lower)) {
    paymentMethod = `BI-FAST ${pLabel}`;
  } else if (/tarik\s+tunai|\batm\b/i.test(lower)) {
    paymentMethod = `ATM / Debit ${pLabel}`;
  } else if (/debit|kartu\s+paspor/i.test(lower)) {
    paymentMethod = `Debit ${pLabel}`;
  }

  // Extract merchant / counterparty
  let counterparty = "";
  if (type === "income") {
    const fromMatch =
      /(?:dari|pengirim|sender)\s*[:\-]?\s*([A-Za-z0-9 .,'&/_-]{2,70})/i.exec(
        combined
      );
    if (fromMatch) {
      counterparty = cleanEntity(fromMatch[1]);
    }
  } else {
    const qrisMerchant =
      /(?:qris\s+(?:di|ke|merchant)|merchant|di)\s*[:\-]?\s*([A-Za-z0-9 .,'&/_-]{2,70})/i.exec(
        combined
      );
    const vaMatch =
      /(?:virtual\s+account|bca\s+va|briva|\bva\b)\s*[:\-]?\s*([A-Za-z0-9 .,'&/_-]{2,70})/i.exec(
        combined
      );
    const toMatch =
      /(?:transfer\s+ke|dikirim\s+ke|kirim\s+uang\s+ke|bayar\s+ke|penerima|tujuan|\bke\b)\s*[:\-]?\s*([A-Za-z0-9 .,'&/_-]{2,70})/i.exec(
        combined
      );

    if (/qris/i.test(lower) && qrisMerchant) {
      counterparty = cleanEntity(qrisMerchant[1]);
    } else if (/virtual\s+account|briva|\bva\b/i.test(lower) && vaMatch) {
      counterparty = cleanEntity(vaMatch[1]);
    } else if (toMatch) {
      counterparty = cleanEntity(toMatch[1]);
    } else if (qrisMerchant) {
      counterparty = cleanEntity(qrisMerchant[1]);
    }
  }

  let title: string;
  if (type === "income") {
    title = counterparty
      ? `Transfer Masuk · ${counterparty}`
      : `Dana Masuk ${pLabel}`;
  } else if (paymentMethod.startsWith("QRIS ")) {
    title = counterparty ? `QRIS · ${counterparty}` : `Pembayaran QRIS ${pLabel}`;
  } else if (paymentMethod.startsWith("Virtual Account ")) {
    title = counterparty
      ? `VA · ${counterparty}`
      : `Pembayaran Virtual Account ${pLabel}`;
  } else if (paymentMethod.startsWith("ATM / Debit ")) {
    title = counterparty
      ? `ATM/Debit · ${counterparty}`
      : `Tarik Tunai / Debit ${pLabel}`;
  } else if (provider.isEwallet) {
    title = counterparty
      ? `${pLabel} · ${counterparty}`
      : `Pembayaran ${pLabel}`;
  } else {
    title = counterparty
      ? `Transfer ke ${counterparty}`
      : `Transaksi Keluar ${pLabel}`;
  }

  const occurredAt = extractBcaDate(combined, opts?.fallbackDate);

  // Extract reference number if available for stronger deduplication
  const refMatch = /(?:no\.?\s*ref(?:erensi)?|ref(?:erence)?|id\s*transaksi)\s*[:#\-]?\s*([A-Za-z0-9_-]{5,40})/i.exec(
    combined
  );
  const dedupeKey = opts?.externalId?.trim()
    ? `ext:${opts.externalId.trim()}`
    : refMatch
      ? `ref:${refMatch[1]}`
      : `notif:${provider.id}:${title}|${paymentMethod}`;

  const notes = `Otomatis dari notifikasi ${pLabel} — ${combined
    .replace(/\s+/g, " ")
    .slice(0, 180)}`;

  return {
    type,
    amount,
    title: title.slice(0, 100),
    occurredAt,
    paymentMethod,
    notes,
    dedupeKey,
    providerName: pLabel,
  };
}

/**
 * RFC 4180 compliant single CSV line splitter supporting quoted commas/quotes.
 */
function parseCsvLine(line: string, delimiter = ","): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function summarizeBcaStatementDescription(
  desc: string,
  type: "income" | "expense"
): { title: string; paymentMethod: string } {
  const clean = desc.replace(/\s+/g, " ").trim();
  const upper = clean.toUpperCase();

  let paymentMethod = "Transfer BCA";
  if (upper.includes("QR ") || upper.includes("QRIS")) {
    paymentMethod = "QRIS BCA";
  } else if (upper.includes("BI-FAST") || upper.includes("BIFAST")) {
    paymentMethod = "BI-FAST BCA";
  } else if (upper.includes("VIRTUAL ACCOUNT") || upper.includes("BCA VA") || upper.includes("VA ")) {
    paymentMethod = "Virtual Account BCA";
  } else if (upper.includes("TARIKAN ATM") || upper.includes("DEBIT")) {
    paymentMethod = "ATM / Debit BCA";
  } else if (upper.includes("BIAYA ADM")) {
    paymentMethod = "Biaya Bank BCA";
  }

  // Strip common KlikBCA technical prefixes to highlight merchant/counterparty
  const stripped = clean
    .replace(/^TRSF\s+E-BANKING\s+(?:CR|DB)\s*/i, "")
    .replace(/^BI-?FAST\s+(?:CR|DB)\s*/i, "")
    .replace(/^QR\s+\d+\s*/i, "")
    .replace(/^DEBIT\s+EDC\s*/i, "")
    .replace(/^TRANSAKSI\s+DEBIT\s*/i, "")
    .replace(/^\d{2}\/\d{2}\s*/i, "")
    .replace(/^[A-Z0-9]{6,}\/\d+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const label = stripped.slice(0, 64) || clean.slice(0, 64);

  if (upper.includes("BIAYA ADM")) {
    return { title: "Biaya Administrasi BCA", paymentMethod };
  }
  if (upper.includes("BUNGA")) {
    return { title: "Bunga Tabungan BCA", paymentMethod: "Bunga Bank BCA" };
  }
  if (upper.includes("PAJAK BUNGA")) {
    return { title: "Pajak Bunga BCA", paymentMethod: "Biaya Bank BCA" };
  }
  if (paymentMethod === "QRIS BCA") {
    return { title: `QRIS · ${label}`.slice(0, 100), paymentMethod };
  }
  if (type === "income") {
    return { title: `Transfer Masuk · ${label}`.slice(0, 100), paymentMethod };
  }
  return { title: label.slice(0, 100), paymentMethod };
}

/**
 * Parses KlikBCA & myBCA CSV mutasi rekening statements cleanly.
 */
export function parseBcaCsv(
  csvText: string,
  fallbackYear?: number
): ParsedBcaCsvResult {
  const cleanText = csvText.replace(/^\uFEFF/, "");
  const rawLines = cleanText.split(/\r?\n/);

  let detectedYear = fallbackYear ?? new Date().getFullYear();
  let detectedPeriod: string | null = null;

  // Scan top metadata for Periode / Year
  for (const line of rawLines.slice(0, 15)) {
    const periodMatch = /periode\s*[,:=]?\s*["']?([^"'\r\n]+)/i.exec(line);
    if (periodMatch) {
      detectedPeriod = periodMatch[1].replace(/^[:,\s]+/, "").trim();
      const yearMatch = /\b(20\d{2})\b/.exec(detectedPeriod);
      if (yearMatch) {
        detectedYear = Number(yearMatch[1]);
      }
    }
  }

  // Locate header row
  let headerIndex = -1;
  let delimiter = ",";
  let dateCol = 0;
  let descCol = 1;
  let amountCol = 3;
  let crDbCol = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const candidateDelim =
      line.split(";").length > line.split(",").length ? ";" : ",";
    const cols = parseCsvLine(line, candidateDelim).map((c) => c.toLowerCase());
    const hasTanggal = cols.some((c) => c.includes("tanggal"));
    const hasKet = cols.some(
      (c) => c.includes("keterangan") || c.includes("deskripsi")
    );
    const hasJumlah = cols.some(
      (c) => c.includes("jumlah") || c.includes("nominal") || c.includes("mutasi")
    );

    if (hasTanggal && hasKet && hasJumlah) {
      headerIndex = i;
      delimiter = candidateDelim;
      dateCol = cols.findIndex((c) => c.includes("tanggal"));
      descCol = cols.findIndex(
        (c) => c.includes("keterangan") || c.includes("deskripsi")
      );
      amountCol = cols.findIndex(
        (c) => c.includes("jumlah") || c.includes("nominal") || c.includes("mutasi")
      );
      crDbCol = cols.findIndex(
        (c) =>
          c === "cr/db" ||
          c === "db/cr" ||
          c === "tipe" ||
          c === "jenis" ||
          c === "mutasi_type"
      );
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      entries: [],
      skippedPending: 0,
      skippedInvalid: 0,
      detectedPeriod,
    };
  }

  const entries: ParsedBcaEntry[] = [];
  let skippedPending = 0;
  let skippedInvalid = 0;

  for (let i = headerIndex + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // Stop at KlikBCA footer summary rows
    if (/^"?(?:saldo awal|mutasi kredit|mutasi debet|saldo akhir)/i.test(line)) {
      break;
    }

    const cols = parseCsvLine(line, delimiter);
    const rawDate = (cols[dateCol] ?? "").replace(/^'+/, "").trim();
    const rawDesc = (cols[descCol] ?? "").trim();
    const rawAmount = (cols[amountCol] ?? "").trim();
    const rawCrDb = crDbCol >= 0 ? (cols[crDbCol] ?? "").trim() : "";

    if (!rawDate && !rawDesc && !rawAmount) {
      continue;
    }

    if (/^pend(?:ing)?$/i.test(rawDate)) {
      skippedPending++;
      continue;
    }

    // Parse date: YYYY-MM-DD, DD/MM/YYYY, or DD/MM
    let occurredAt: string | null = null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
    const dmyFull = /^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/.exec(rawDate);
    const dmyShort = /^(\d{1,2})[/-](\d{1,2})$/.exec(rawDate);

    if (iso) {
      occurredAt = toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    } else if (dmyFull) {
      occurredAt = toIsoDate(
        Number(dmyFull[3]),
        Number(dmyFull[2]),
        Number(dmyFull[1])
      );
    } else if (dmyShort) {
      occurredAt = toIsoDate(
        detectedYear,
        Number(dmyShort[2]),
        Number(dmyShort[1])
      );
    }

    if (!occurredAt) {
      skippedInvalid++;
      continue;
    }

    // Determine type & numeric part
    const amountCombined = `${rawAmount} ${rawCrDb}`.trim();
    let type: "income" | "expense" | null = null;
    if (/\bCR\b/i.test(amountCombined) || /^\+/.test(rawAmount)) {
      type = "income";
    } else if (/\bDB\b/i.test(amountCombined) || /^-/.test(rawAmount)) {
      type = "expense";
    } else if (/\bCR\b/i.test(rawDesc)) {
      type = "income";
    } else if (/\bDB\b/i.test(rawDesc)) {
      type = "expense";
    }

    const numericPart = rawAmount.replace(/\b(?:CR|DB)\b/gi, "").trim();
    const amount = parseBcaAmount(numericPart);

    if (!type || !amount) {
      skippedInvalid++;
      continue;
    }

    const { title, paymentMethod } = summarizeBcaStatementDescription(
      rawDesc || "Mutasi BCA",
      type
    );

    entries.push({
      type,
      amount,
      title,
      occurredAt,
      paymentMethod,
      notes: `Impor CSV Mutasi BCA — ${rawDesc.slice(0, 180)}`,
      dedupeKey: `csv:${rawDesc.toLowerCase().replace(/\s+/g, " ").trim()}`,
    });
  }

  return {
    entries,
    skippedPending,
    skippedInvalid,
    detectedPeriod,
  };
}

/**
 * Suggests the best matching category ID from a wallet owner's category list.
 */
export function suggestBcaCategoryId(
  ownerCategories: Array<{ id: string; name: string; type: "income" | "expense" }>,
  type: "income" | "expense",
  textForMatching: string
): string {
  const candidates = ownerCategories.filter((c) => c.type === type);
  if (candidates.length === 0) {
    throw new Error("Kategori tidak tersedia untuk dompet tujuan.");
  }

  const lower = textForMatching.toLowerCase();

  const rules: Array<{ categoryKeywords: string[]; matchTerms: string[] }> =
    type === "expense"
      ? [
          {
            categoryKeywords: ["makanan", "minuman", "kuliner"],
            matchTerms: [
              "kopi",
              "coffee",
              "starbucks",
              "kenangan",
              "fore",
              "gofood",
              "grabfood",
              "shopeefood",
              "resto",
              "warung",
              "warteg",
              "padang",
              "nasi",
              "bakso",
              "soto",
              "sate",
              "mie",
              "ayam",
              "boba",
              "es teh",
              "sarapan",
              "jajan",
              "snack",
              "mcd",
              "kfc",
              "hokben",
              "indomaret",
              "alfamart",
              "cafe",
              "bakery",
              "makan",
              "minum",
              "dapur",
            ],
          },
          {
            categoryKeywords: ["transport"],
            matchTerms: [
              "gojek",
              "grab",
              "maxim",
              "ojol",
              "bluebird",
              "bensin",
              "pertamax",
              "pertalite",
              "pertamina",
              "shell",
              "spbu",
              "tol",
              "parkir",
              "kai",
              "kereta",
              "garuda",
              "citilink",
              "mrt",
              "transjakarta",
              "whoosh",
              "servis motor",
              "servis mobil",
            ],
          },
          {
            categoryKeywords: ["tagihan", "utilitas"],
            matchTerms: [
              "pln",
              "listrik",
              "pdam",
              "indihome",
              "biznet",
              "firstmedia",
              "telkomsel",
              "xl",
              "indosat",
              "bpjs",
              "pulsa",
              "kuota",
              "paket data",
              "netflix",
              "spotify",
              "icloud",
              "wifi",
              "internet",
              "kos",
              "kontrakan",
              "sewa",
              "biaya adm",
              "pajak bunga",
            ],
          },
          {
            categoryKeywords: ["belanja", "rumah tangga"],
            matchTerms: [
              "tokopedia",
              "shopee",
              "blibli",
              "lazada",
              "superindo",
              "hypermart",
              "transmart",
              "lotte",
              "farmers",
              "pasar",
              "ikea",
              "ace",
              "mr diy",
              "laundry",
              "sabun",
              "belanja",
              "skincare",
            ],
          },
          {
            categoryKeywords: ["kesehatan"],
            matchTerms: [
              "apotek",
              "obat",
              "vitamin",
              "kimia farma",
              "guardian",
              "watsons",
              "halodoc",
              "alodokter",
              "klinik",
              "rumah sakit",
              "hospital",
              "dokter",
            ],
          },
          {
            categoryKeywords: ["pendidikan"],
            matchTerms: [
              "spp",
              "kursus",
              "udemy",
              "coursera",
              "gramedia",
              "sekolah",
              "kampus",
              "universitas",
            ],
          },
          {
            categoryKeywords: ["hiburan", "gaya hidup"],
            matchTerms: [
              "xxi",
              "cgv",
              "cinepolis",
              "bioskop",
              "steam",
              "playstation",
              "gym",
              "hotel",
              "traveloka",
              "tiket.com",
              "agoda",
            ],
          },
        ]
      : [
          {
            categoryKeywords: ["gaji"],
            matchTerms: ["gaji", "payroll", "salary", "thr", "tunjangan"],
          },
          {
            categoryKeywords: ["bisnis", "freelance"],
            matchTerms: [
              "invoice",
              "proyek",
              "project",
              "freelance",
              "klien",
              "client",
              "jasa",
              "toko",
              "penjualan",
            ],
          },
          {
            categoryKeywords: ["investasi"],
            matchTerms: [
              "dividen",
              "kupon",
              "bunga",
              "bibit",
              "bareksa",
              "stockbit",
              "ajaib",
              "deposito",
              "sbn",
            ],
          },
          {
            categoryKeywords: ["hadiah", "bonus"],
            matchTerms: ["bonus", "hadiah", "cashback", "reward", "komisi"],
          },
        ];

  for (const rule of rules) {
    if (rule.matchTerms.some((term) => lower.includes(term))) {
      const matched = candidates.find((c) =>
        rule.categoryKeywords.some((kw) => c.name.toLowerCase().includes(kw))
      );
      if (matched) {
        return matched.id;
      }
    }
  }

  // Fallback to "Lainnya" if present, else first category of that type
  const fallback =
    candidates.find((c) => c.name.toLowerCase().includes("lain")) ??
    candidates[0];
  return fallback.id;
}
