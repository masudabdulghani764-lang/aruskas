import { describe, expect, test } from "bun:test";
import type { BudgetProgressView } from "@/lib/budgets";
import {
  buildReportQueryString,
  formatDigitsIDR,
  getNextMonthYM,
  resolveReportPeriodRange,
  sanitizeNonNegativeDigits,
  sanitizePositiveDigits,
  summarizeBudgets,
} from "@/lib/view-helpers";

function makeBudget(
  overrides: Partial<BudgetProgressView>
): BudgetProgressView {
  return {
    id: "b1",
    categoryId: "c1",
    categoryName: "Makan",
    categoryColor: "#14532D",
    categoryIcon: "Utensils",
    month: "2026-11",
    limitAmount: 1_000_000,
    spentAmount: 500_000,
    remainingAmount: 500_000,
    percentage: 50,
    status: "safe",
    ...overrides,
  };
}

describe("Task 9 View Helpers", () => {
  test("getNextMonthYM advances month cleanly across year boundary", () => {
    expect(getNextMonthYM("2026-11")).toBe("2026-12");
    expect(getNextMonthYM("2026-12")).toBe("2027-01");
    expect(getNextMonthYM("2025-01")).toBe("2025-02");
  });

  test("summarizeBudgets aggregates totals and status counts accurately", () => {
    const empty = summarizeBudgets([]);
    expect(empty).toEqual({
      totalLimit: 0,
      totalSpent: 0,
      totalRemaining: 0,
      safeCount: 0,
      warningCount: 0,
      exceededCount: 0,
    });

    const summary = summarizeBudgets([
      makeBudget({
        id: "b1",
        limitAmount: 1_000_000,
        spentAmount: 500_000,
        remainingAmount: 500_000,
        status: "safe",
      }),
      makeBudget({
        id: "b2",
        limitAmount: 500_000,
        spentAmount: 450_000,
        remainingAmount: 50_000,
        status: "warning",
      }),
      makeBudget({
        id: "b3",
        limitAmount: 300_000,
        spentAmount: 400_000,
        remainingAmount: -100_000,
        status: "exceeded",
      }),
    ]);

    expect(summary).toEqual({
      totalLimit: 1_800_000,
      totalSpent: 1_350_000,
      totalRemaining: 450_000,
      safeCount: 1,
      warningCount: 1,
      exceededCount: 1,
    });
  });

  test("resolveReportPeriodRange resolves this_month, last_month, this_quarter, and this_year", () => {
    const refNov = new Date(2026, 10, 21); // Nov 21, 2026
    expect(resolveReportPeriodRange("this_month", refNov)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(resolveReportPeriodRange("last_month", refNov)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolveReportPeriodRange("this_quarter", refNov)).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
    expect(resolveReportPeriodRange("this_year", refNov)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });

    const refJan = new Date(2026, 0, 15); // Jan 15, 2026
    expect(resolveReportPeriodRange("last_month", refJan)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolveReportPeriodRange("this_quarter", refJan)).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });

    const refFebLeap = new Date(2024, 1, 10); // Feb 10, 2024 (leap year)
    expect(resolveReportPeriodRange("this_month", refFebLeap)).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  test("buildReportQueryString maps scope and specific wallet selections properly", () => {
    expect(
      buildReportQueryString({
        from: "2026-11-01",
        to: "2026-11-30",
        walletSelection: "scope:all",
      })
    ).toBe("from=2026-11-01&to=2026-11-30&scope=all");

    expect(
      buildReportQueryString({
        from: "2026-11-01",
        to: "2026-11-30",
        walletSelection: "scope:personal",
      })
    ).toBe("from=2026-11-01&to=2026-11-30&scope=personal");

    expect(
      buildReportQueryString({
        from: "2026-11-01",
        to: "2026-11-30",
        walletSelection: "wallet:w-123",
      })
    ).toBe("from=2026-11-01&to=2026-11-30&walletId=w-123");
  });

  test("digit sanitization and Rupiah input formatting handle zero and separators cleanly", () => {
    expect(sanitizePositiveDigits("Rp 001.250.000")).toBe("1250000");
    expect(sanitizePositiveDigits("000")).toBe("");
    expect(sanitizeNonNegativeDigits("000")).toBe("0");
    expect(sanitizeNonNegativeDigits("Rp 050.000")).toBe("50000");
    expect(sanitizeNonNegativeDigits("")).toBe("");
    expect(formatDigitsIDR("")).toBe("");
    expect(formatDigitsIDR("0")).toBe("0");
    expect(formatDigitsIDR("1250000")).toBe("1.250.000");
  });
});
