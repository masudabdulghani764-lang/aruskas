import {
  parseBcaNotification,
  suggestBcaCategoryId,
} from "@/lib/bank-notification-parser";
import { getTodayISO } from "@/lib/format";

export type SmartPasteCategoryOption = {
  id: string;
  name: string;
  type: "income" | "expense";
};

export type SmartPasteResult = {
  type: "income" | "expense" | "transfer";
  amount: number;
  title: string;
  occurredAt: string;
  paymentMethod: string | null;
  categoryId: string | null;
  categoryName: string | null;
  detectedSource: "bank_notification" | "natural_text";
  notes?: string;
};

function subtractDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function extractCasualDate(
  text: string,
  todayIso: string
): { occurredAt: string; cleaned: string } {
  const isoMatch = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text);
  if (isoMatch) {
    return {
      occurredAt: isoMatch[1],
      cleaned: text.replace(isoMatch[0], " "),
    };
  }

  const dmyMatch = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/.exec(text);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        occurredAt: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        cleaned: text.replace(dmyMatch[0], " "),
      };
    }
  }

  if (/\bkemarin\s+lusa\b/i.test(text)) {
    return {
      occurredAt: subtractDaysIso(todayIso, 2),
      cleaned: text.replace(/\bkemarin\s+lusa\b/gi, " "),
    };
  }

  const daysAgoMatch = /\b(\d{1,2})\s+hari\s+(?:yang\s+)?lalu\b/i.exec(text);
  if (daysAgoMatch) {
    const n = Math.min(60, Math.max(1, Number(daysAgoMatch[1])));
    return {
      occurredAt: subtractDaysIso(todayIso, n),
      cleaned: text.replace(daysAgoMatch[0], " "),
    };
  }

  if (/\bkemarin\b/i.test(text)) {
    return {
      occurredAt: subtractDaysIso(todayIso, 1),
      cleaned: text.replace(/\bkemarin\b/gi, " "),
    };
  }

  if (/\bhari\s+ini\b|\btadi\b/i.test(text)) {
    return {
      occurredAt: todayIso,
      cleaned: text.replace(/\b(?:hari\s+ini|tadi)\b/gi, " "),
    };
  }

  return { occurredAt: todayIso, cleaned: text };
}

function extractCasualAmount(text: string): {
  amount: number;
  matched: string;
} | null {
  // 1. Shorthand with multiplier: 1.5jt, 2,5 juta, 38rb, 38.5k, 150 ribu
  const multRegex =
    /(?:^|[\s(])(?:rp\.?\s*)?(\d+(?:[.,]\d{1,3})?)\s*(juta|jt|ribu|rb|k)\b/i;
  const multMatch = multRegex.exec(text);
  if (multMatch) {
    const unit = multMatch[2].toLowerCase();
    const rawNum = multMatch[1].replace(",", ".");
    const parsedNum = Number(rawNum);
    if (Number.isFinite(parsedNum) && parsedNum > 0) {
      const factor = unit === "jt" || unit === "juta" ? 1_000_000 : 1_000;
      const amount = Math.round(parsedNum * factor);
      if (Number.isSafeInteger(amount) && amount > 0) {
        return { amount, matched: multMatch[0] };
      }
    }
  }

  // 2. Explicit Rp / IDR amount: Rp 45.000 or Rp45000 or Rp 1.250.000,00
  const rpRegex =
    /(?:rp\.?|idr)\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;
  const rpMatch = rpRegex.exec(text);
  if (rpMatch) {
    const raw = rpMatch[1];
    let norm = raw;
    if (norm.includes(".") && norm.includes(",")) {
      norm =
        norm.lastIndexOf(",") > norm.lastIndexOf(".")
          ? norm.replace(/\./g, "").replace(",", ".")
          : norm.replace(/,/g, "");
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(norm)) {
      norm = norm.replace(/\./g, "");
    } else if (/^\d{1,3}(?:,\d{3})+$/.test(norm)) {
      norm = norm.replace(/,/g, "");
    } else {
      norm = norm.replace(",", ".");
    }
    const amount = Math.round(Number(norm));
    if (Number.isSafeInteger(amount) && amount > 0) {
      return { amount, matched: rpMatch[0] };
    }
  }

  // 3. Formatted thousands without Rp: 38.000 or 1.250.000 or plain >= 1000 number
  const plainRegex = /(?:^|\s)(\d{1,3}(?:[.,]\d{3})+|\d{4,12})(?=\s|$|[.,!?])/;
  const plainMatch = plainRegex.exec(text);
  if (plainMatch) {
    const digits = plainMatch[1].replace(/[.,]/g, "");
    const amount = Number(digits);
    if (Number.isSafeInteger(amount) && amount >= 100) {
      return { amount, matched: plainMatch[0] };
    }
  }

  return null;
}

function detectPaymentMethod(text: string): {
  method: string | null;
  cleaned: string;
} {
  const patterns: Array<{ method: string; regex: RegExp }> = [
    {
      method: "QRIS",
      regex: /\b(?:pakai|pake|via|dengan|lewat|by)?\s*qris\b/gi,
    },
    {
      method: "Tunai",
      regex: /\b(?:pakai|pake|via|dengan|lewat|by)?\s*(?:tunai|cash|kontan)\b/gi,
    },
    {
      method: "E-Wallet",
      regex:
        /\b(?:pakai|pake|via|dengan|lewat|by)?\s*(?:gopay|go-?pay|ovo|dana|shopeepay|spay|linkaja|e-?wallet)\b/gi,
    },
    {
      method: "Kartu Kredit",
      regex:
        /\b(?:pakai|pake|via|dengan|lewat|by)?\s*(?:kartu\s+kredit|credit\s+card|\bcc\b)\b/gi,
    },
    {
      method: "Kartu Debit",
      regex:
        /\b(?:pakai|pake|via|dengan|lewat|by)?\s*(?:kartu\s+debit|debit|edc|gesek)\b/gi,
    },
    {
      method: "Auto-Debit",
      regex: /\b(?:pakai|pake|via|dengan|lewat|by)?\s*auto-?debit\b/gi,
    },
    {
      method: "Transfer Bank",
      regex:
        /\b(?:pakai|pake|via|dengan|lewat|by)?\s*(?:transfer\s*bank|trf|tf|transfer|bi-?fast|mybca|m-?bca|bca|livin|mandiri|brimo|bri|wondr|bni|jago|seabank|blu|bsi)\b/gi,
    },
  ];

  for (const item of patterns) {
    if (item.regex.test(text)) {
      item.regex.lastIndex = 0;
      return {
        method: item.method,
        cleaned: text.replace(item.regex, " "),
      };
    }
  }

  return { method: null, cleaned: text };
}

function mapBankPaymentMethodToQuickAdd(bankMethod: string): string {
  const lower = bankMethod.toLowerCase();
  if (lower.includes("qris")) return "QRIS";
  if (
    lower.includes("gopay") ||
    lower.includes("shopeepay") ||
    lower.includes("ovo") ||
    lower.includes("dana")
  ) {
    return "E-Wallet";
  }
  if (lower.includes("debit") || lower.includes("atm")) return "Kartu Debit";
  return "Transfer Bank";
}

function capitalizeTitle(raw: string): string {
  const clean = raw
    .replace(/\b(?:sebesar|senilai|harga|bayar|beli|buat|untuk|di|ke)\s*$/i, "")
    .replace(/^\s*(?:bayar|beli)\s+/i, (m) => m)
    .replace(/^[-–—:,./\s]+|[-–—:,./\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "";
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Parses a casual 1-line Indonesian transaction phrase (e.g. "Makan siang Padang 38rb pakai QRIS")
 * OR a pasted Indonesian bank/e-wallet notification into structured transaction form fields.
 */
export function parseSmartTransactionText(
  rawInput: string,
  ownerCategories: SmartPasteCategoryOption[],
  todayIso?: string
): SmartPasteResult | null {
  const input = rawInput.trim();
  if (input.length < 3) {
    return null;
  }

  const effectiveToday = todayIso ?? getTodayISO();

  // 1. Check if user pasted a full bank / e-wallet notification message
  const looksLikeNotif =
    input.length >= 28 &&
    /(?:rp\.?|idr)\s*\d/i.test(input) &&
    /\b(?:berhasil|sukses|rekening|notifikasi|no\.?\s*ref|virtual\s+account|menerima\s+transfer|transaksi\s+qris|saldo\s+masuk|kamu\s+bayar|kamu\s+terima)\b/i.test(
      input
    );

  if (looksLikeNotif) {
    const bankParsed = parseBcaNotification(input, {
      fallbackDate: effectiveToday,
    });
    if (bankParsed) {
      let categoryId: string | null = null;
      let categoryName: string | null = null;
      const sameTypeCats = ownerCategories.filter(
        (c) => c.type === bankParsed.type
      );
      if (sameTypeCats.length > 0) {
        categoryId = suggestBcaCategoryId(
          ownerCategories,
          bankParsed.type,
          `${bankParsed.title} ${bankParsed.notes}`
        );
        categoryName =
          sameTypeCats.find((c) => c.id === categoryId)?.name ?? null;
      }

      return {
        type: bankParsed.type,
        amount: bankParsed.amount,
        title: bankParsed.title,
        occurredAt: bankParsed.occurredAt,
        paymentMethod: mapBankPaymentMethodToQuickAdd(bankParsed.paymentMethod),
        categoryId,
        categoryName,
        detectedSource: "bank_notification",
        notes: bankParsed.notes,
      };
    }
  }

  // 2. Casual 1-line Indonesian text parsing
  const amountResult = extractCasualAmount(input);
  if (!amountResult) {
    return null;
  }

  const withoutAmount = input.replace(amountResult.matched, " ");
  const { occurredAt, cleaned: withoutDate } = extractCasualDate(
    withoutAmount,
    effectiveToday
  );

  // Detect type before stripping payment keywords
  const lower = input.toLowerCase();
  const isTransfer =
    /\b(?:pindah\s+(?:saldo|dana|ke\s+tabungan|ke\s+dompet)|transfer\s+antar\s+dompet|mutasi\s+ke\s+tabungan)\b/i.test(
      lower
    );
  const isIncome =
    !isTransfer &&
    /\b(?:gaji|salary|payroll|thr|bonus|terima|diterima|dapat|dapet|pemasukan|uang\s+masuk|dana\s+masuk|transfer\s+masuk|masuk\s+dari|freelance|invoice|bayaran|klien|dividen|kupon|cashback|refund|jual|penjualan|omzet|komisi|hadiah|angpao)\b/i.test(
      lower
    );

  const type: "income" | "expense" | "transfer" = isTransfer
    ? "transfer"
    : isIncome
      ? "income"
      : "expense";

  const { method: paymentMethod, cleaned: withoutMethod } =
    detectPaymentMethod(withoutDate);

  const rawTitle = capitalizeTitle(withoutMethod);
  const title =
    rawTitle ||
    (type === "income"
      ? "Pemasukan Cepat"
      : type === "transfer"
        ? "Transfer Antar Dompet"
        : "Pengeluaran Cepat");

  let categoryId: string | null = null;
  let categoryName: string | null = null;
  if (type !== "transfer") {
    const sameTypeCats = ownerCategories.filter((c) => c.type === type);
    if (sameTypeCats.length > 0) {
      categoryId = suggestBcaCategoryId(
        ownerCategories,
        type,
        `${title} ${input}`
      );
      categoryName =
        sameTypeCats.find((c) => c.id === categoryId)?.name ?? null;
    }
  }

  return {
    type,
    amount: amountResult.amount,
    title: title.slice(0, 120),
    occurredAt,
    paymentMethod,
    categoryId,
    categoryName,
    detectedSource: "natural_text",
  };
}
