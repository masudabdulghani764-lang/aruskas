const SHORT_MONTHS_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

const FULL_MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/**
 * Formats an integer Rupiah amount in Indonesian locale (`Rp 1.250.000`).
 */
export function formatIDR(amount: number, opts?: { signed?: boolean }): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const absFormatted = String(Math.abs(safeAmount)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    "."
  );

  if (safeAmount < 0) {
    return `-Rp ${absFormatted}`;
  }
  if (opts?.signed && safeAmount > 0) {
    return `+Rp ${absFormatted}`;
  }
  return `Rp ${absFormatted}`;
}

/**
 * Formats an ISO date string (`YYYY-MM-DD` or ISO timestamp) to Indonesian short date (`21 Nov 2026`).
 */
export function formatDateID(isoDate: string): string {
  const datePart = isoDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) {
    return isoDate;
  }

  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthLabel = SHORT_MONTHS_ID[monthIndex];

  if (!monthLabel || Number.isNaN(day)) {
    return isoDate;
  }

  return `${day} ${monthLabel} ${year}`;
}

/**
 * Formats a `YYYY-MM` month string to full Indonesian month and year (`November 2026`).
 */
export function formatMonthID(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) {
    return ym;
  }

  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const monthLabel = FULL_MONTHS_ID[monthIndex];

  if (!monthLabel) {
    return ym;
  }

  return `${monthLabel} ${year}`;
}

function getWibDateParts(now: Date = new Date()): {
  year: string;
  month: string;
  day: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? String(now.getFullYear());
  const month =
    parts.find((p) => p.type === "month")?.value ??
    String(now.getMonth() + 1).padStart(2, "0");
  const day =
    parts.find((p) => p.type === "day")?.value ??
    String(now.getDate()).padStart(2, "0");

  return { year, month, day };
}

/**
 * Returns the `YYYY-MM` string for the provided date (defaults to today in WIB `Asia/Jakarta`).
 */
export function getCurrentMonthYM(date?: Date): string {
  if (!date) {
    const { year, month } = getWibDateParts();
    return `${year}-${month}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Returns the previous `YYYY-MM` month string (e.g., `"2026-01"` -> `"2025-12"`).
 */
export function getPreviousMonthYM(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) {
    return ym;
  }

  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    year -= 1;
    month = 12;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Returns the `YYYY-MM-DD` ISO date string for the provided date (defaults to today in WIB `Asia/Jakarta`).
 */
export function getTodayISO(date?: Date): string {
  if (!date) {
    const { year, month, day } = getWibDateParts();
    return `${year}-${month}-${day}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Neutralizes spreadsheet formula injection and escapes CSV cells per RFC 4180.
 */
export function escapeCsvCell(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
