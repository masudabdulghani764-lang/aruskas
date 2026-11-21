import type { BudgetProgressView } from "@/lib/budgets";
import { getCurrentMonthYM, getPreviousMonthYM } from "@/lib/format";

export type ReportPeriodPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export interface BudgetSummaryMetrics {
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  safeCount: number;
  warningCount: number;
  exceededCount: number;
}

/**
 * Advances a `YYYY-MM` calendar month string by one month.
 */
export function getNextMonthYM(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) {
    return ym;
  }

  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    year += 1;
    month = 1;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Aggregates monthly budget totals and category status counts.
 */
export function summarizeBudgets(
  budgets: readonly BudgetProgressView[]
): BudgetSummaryMetrics {
  let totalLimit = 0;
  let totalSpent = 0;
  let totalRemaining = 0;
  let safeCount = 0;
  let warningCount = 0;
  let exceededCount = 0;

  for (const item of budgets) {
    totalLimit += item.limitAmount;
    totalSpent += item.spentAmount;
    totalRemaining += item.remainingAmount;
    if (item.status === "exceeded") {
      exceededCount += 1;
    } else if (item.status === "warning") {
      warningCount += 1;
    } else {
      safeCount += 1;
    }
  }

  return {
    totalLimit,
    totalSpent,
    totalRemaining,
    safeCount,
    warningCount,
    exceededCount,
  };
}

function getMonthEndISO(ym: string): string {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * Resolves inclusive `[from, to]` ISO dates for built-in Indonesian report period presets.
 */
export function resolveReportPeriodRange(
  preset: Exclude<ReportPeriodPreset, "custom">,
  referenceDate: Date = new Date()
): { from: string; to: string } {
  const currentYM = getCurrentMonthYM(referenceDate);

  if (preset === "this_month") {
    return { from: `${currentYM}-01`, to: getMonthEndISO(currentYM) };
  }

  if (preset === "last_month") {
    const prev = getPreviousMonthYM(currentYM);
    return { from: `${prev}-01`, to: getMonthEndISO(prev) };
  }

  const year = currentYM.slice(0, 4);
  if (preset === "this_quarter") {
    const monthNum = Number(currentYM.slice(5, 7));
    const qStartMonth = Math.floor((monthNum - 1) / 3) * 3 + 1;
    const qEndMonth = qStartMonth + 2;
    const startYM = `${year}-${String(qStartMonth).padStart(2, "0")}`;
    const endYM = `${year}-${String(qEndMonth).padStart(2, "0")}`;
    return { from: `${startYM}-01`, to: getMonthEndISO(endYM) };
  }

  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * Encodes report filter parameters (`from`, `to`, and either `walletId` or `scope`).
 */
export function buildReportQueryString(opts: {
  from: string;
  to: string;
  walletSelection: string;
}): string {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);

  if (opts.walletSelection.startsWith("wallet:")) {
    const walletId = opts.walletSelection.slice("wallet:".length).trim();
    if (walletId) {
      params.set("walletId", walletId);
    } else {
      params.set("scope", "all");
    }
  } else if (opts.walletSelection === "scope:personal") {
    params.set("scope", "personal");
  } else {
    params.set("scope", "all");
  }

  return params.toString();
}

/**
 * Strips non-numeric characters and leading zeros for positive Rupiah inputs.
 */
export function sanitizePositiveDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  return digits.slice(0, 15);
}

/**
 * Strips non-numeric characters while preserving `"0"` for optional zero-allowed Rupiah inputs.
 */
export function sanitizeNonNegativeDigits(raw: string): string {
  const onlyDigits = raw.replace(/\D/g, "");
  if (!onlyDigits) {
    return "";
  }
  const stripped = onlyDigits.replace(/^0+/, "");
  return (stripped === "" ? "0" : stripped).slice(0, 15);
}

/**
 * Formats raw digit strings with Indonesian thousand dot separators (`1250000` -> `1.250.000`).
 */
export function formatDigitsIDR(digits: string): string {
  if (!digits) {
    return "";
  }
  if (digits === "0") {
    return "0";
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
