import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { closeDb, createDb, getDb } from "@/db";
import { categories } from "@/db/schema";
import { SESSION_COOKIE_NAME, registerUser } from "@/lib/auth";
import { upsertBudget } from "@/lib/budgets";
import { AppError } from "@/lib/errors";
import { getTodayISO } from "@/lib/format";
import { createSavingsGoal } from "@/lib/goals";
import { createRecurringRule } from "@/lib/recurring";
import { buildTransactionsCsv, buildUserBackupJson } from "@/lib/export";
import { getDashboardSummary, getFinancialReport } from "@/lib/reports";
import { ensureDemoSeeded } from "@/lib/seed";
import { createTransaction, listTransactions } from "@/lib/transactions";
import {
  acceptWalletInvite,
  createWallet,
  createWalletInvite,
  updateWallet,
} from "@/lib/wallets";

let mockSessionCookie: string | undefined;

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && mockSessionCookie
        ? { name, value: mockSessionCookie }
        : undefined,
  }),
}));

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { GET as getDashboardRoute } from "@/app/api/dashboard/route";
import { GET as exportReportsCsvRoute } from "@/app/api/reports/export/csv/route";
import { GET as getReportsRoute } from "@/app/api/reports/route";
import { GET as getBackupRoute } from "@/app/api/settings/backup/route";
import { POST as changePasswordRoute } from "@/app/api/settings/password/route";
import { PATCH as updateProfileRoute } from "@/app/api/settings/profile/route";

async function expectAppError(
  fn: () => unknown | Promise<unknown>,
  expectedStatus: number
): Promise<AppError> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(AppError);
  const appErr = caught as AppError;
  expect(appErr.status).toBe(expectedStatus);
  return appErr;
}

function getUserCategory(
  db: ReturnType<typeof createDb>["db"],
  userId: string,
  type: "income" | "expense",
  index = 0
) {
  const rows = db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .all()
    .filter((c) => c.type === type);
  expect(rows.length).toBeGreaterThan(index);
  return rows[index];
}

describe("Dashboard Aggregation, Financial Reports & CSV/Backup Export", () => {
  test("getDashboardSummary excludes viewer wallets from totalBalance/cashflow into watchedWallets and scope='personal' excludes shared wallets", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka-dash@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia-dash@aruskas.test",
        password: "Password123!",
      });

      const personalBca = createWallet(db, owner.user.id, {
        name: "BCA Pribadi",
        type: "bank",
        initialBalance: 5_000_000,
      });
      const sharedKas = createWallet(db, owner.user.id, {
        name: "Kas Bersama",
        type: "cash",
        initialBalance: 2_000_000,
      });
      const archivedWallet = createWallet(db, owner.user.id, {
        name: "Dompet Lama",
        type: "cash",
        initialBalance: 9_000_000,
      });
      updateWallet(db, archivedWallet.id, owner.user.id, { archived: true });

      const partnerEditorWallet = createWallet(db, partner.user.id, {
        name: "Kas Proyek",
        type: "ewallet",
        initialBalance: 1_000_000,
      });
      const partnerViewerWallet = createWallet(db, partner.user.id, {
        name: "Tabungan Nadia",
        type: "savings",
        initialBalance: 20_000_000,
      });

      const sharedInvite = createWalletInvite(db, sharedKas.id, owner.user.id, {
        email: partner.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, sharedInvite.token, partner.user);

      const editorInvite = createWalletInvite(
        db,
        partnerEditorWallet.id,
        partner.user.id,
        {
          email: owner.user.email,
          role: "editor",
        }
      );
      acceptWalletInvite(db, editorInvite.token, owner.user);

      const viewerInvite = createWalletInvite(
        db,
        partnerViewerWallet.id,
        partner.user.id,
        {
          email: owner.user.email,
          role: "viewer",
        }
      );
      acceptWalletInvite(db, viewerInvite.token, owner.user);

      const ownerIncomeCat = getUserCategory(db, owner.user.id, "income", 0);
      const ownerExpenseCat = getUserCategory(db, owner.user.id, "expense", 0);
      const partnerIncomeCat = getUserCategory(db, partner.user.id, "income", 0);
      const partnerExpenseCat = getUserCategory(
        db,
        partner.user.id,
        "expense",
        0
      );

      // Previous month (2026-10) transactions
      createTransaction(db, owner.user.id, {
        walletId: personalBca.id,
        categoryId: ownerIncomeCat.id,
        type: "income",
        amount: 10_000_000,
        title: "Gaji Oktober",
        occurredAt: "2026-10-05",
      });
      createTransaction(db, owner.user.id, {
        walletId: personalBca.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 2_000_000,
        title: "Sewa Oktober",
        occurredAt: "2026-10-10",
      });

      // Current month (2026-11) transactions
      createTransaction(db, owner.user.id, {
        walletId: personalBca.id,
        categoryId: ownerIncomeCat.id,
        type: "income",
        amount: 10_000_000,
        title: "Gaji November",
        occurredAt: "2026-11-01",
      });
      createTransaction(db, owner.user.id, {
        walletId: personalBca.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 3_000_000,
        title: "Belanja Pribadi",
        occurredAt: "2026-11-04",
      });
      // Transfer between personal and shared must NOT count as income/expense in monthlySeries
      createTransaction(db, owner.user.id, {
        walletId: personalBca.id,
        targetWalletId: sharedKas.id,
        type: "transfer",
        amount: 1_500_000,
        title: "Setoran Kas Bersama",
        occurredAt: "2026-11-05",
      });
      // Expense on shared wallet (included in scope='all', excluded in scope='personal')
      createTransaction(db, owner.user.id, {
        walletId: sharedKas.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 500_000,
        title: "Listrik Rumah",
        occurredAt: "2026-11-06",
      });
      // Income on partnerEditorWallet (included in scope='all', excluded in scope='personal')
      createTransaction(db, owner.user.id, {
        walletId: partnerEditorWallet.id,
        categoryId: partnerIncomeCat.id,
        type: "income",
        amount: 500_000,
        title: "Bonus Proyek",
        occurredAt: "2026-11-07",
      });
      // Viewer wallet massive income & expense -> MUST BE EXCLUDED from all totals & series
      createTransaction(db, partner.user.id, {
        walletId: partnerViewerWallet.id,
        categoryId: partnerIncomeCat.id,
        type: "income",
        amount: 50_000_000,
        title: "Hadiah Besar Nadia",
        occurredAt: "2026-11-08",
      });
      createTransaction(db, partner.user.id, {
        walletId: partnerViewerWallet.id,
        categoryId: partnerExpenseCat.id,
        type: "expense",
        amount: 1_000_000,
        title: "Belanja Nadia",
        occurredAt: "2026-11-09",
      });

      // Budget, due recurring rule, and pending invite
      upsertBudget(db, owner.user.id, {
        categoryId: ownerExpenseCat.id,
        month: "2026-11",
        limitAmount: 5_000_000,
      });
      createRecurringRule(db, owner.user.id, {
        walletId: personalBca.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 250_000,
        title: "Internet Bulanan",
        frequency: "monthly",
        nextRunDate: "2026-11-20",
      });
      const extraWallet = createWallet(db, partner.user.id, {
        name: "Dompet Undangan",
        type: "cash",
        initialBalance: 300_000,
      });
      createWalletInvite(db, extraWallet.id, partner.user.id, {
        email: owner.user.email,
        role: "viewer",
      });

      // 1. scope = "all"
      const allSummary = getDashboardSummary(
        db,
        owner.user.id,
        owner.user.email,
        { scope: "all", todayIso: "2026-11-21" }
      );

      expect(allSummary.scope).toBe("all");
      expect(allSummary.month).toBe("2026-11");
      // Active wallets: personalBca (18.5M) + sharedKas (3.0M) + partnerEditorWallet (1.5M) + default Dompet Utama (0) = 23.0M
      // Viewer wallet (69M) & archived wallet (9M) MUST be excluded!
      expect(allSummary.activeWallets.map((w) => w.name)).toEqual([
        "Dompet Utama",
        "BCA Pribadi",
        "Kas Bersama",
        "Kas Proyek",
      ]);
      expect(allSummary.watchedWallets.map((w) => w.name)).toEqual([
        "Tabungan Nadia",
      ]);
      expect(allSummary.totalBalance).toBe(23_000_000);
      expect(allSummary.currentMonthIncome).toBe(10_500_000);
      expect(allSummary.currentMonthExpense).toBe(3_500_000);
      expect(allSummary.currentMonthNet).toBe(7_000_000);
      expect(allSummary.previousMonthNet).toBe(8_000_000);
      expect(allSummary.savingRate).toBe(66.7);
      // Start of Nov balance: 5M + 2M + 1M + (10M - 2M) = 16M; End of Nov: 23M => +43.8%
      expect(allSummary.balanceGrowthPct).toBe(43.8);

      expect(allSummary.monthlySeries).toHaveLength(6);
      expect(allSummary.monthlySeries.map((m) => m.month)).toEqual([
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
        "2026-11",
      ]);
      expect(allSummary.monthlySeries[4]).toEqual({
        month: "2026-10",
        label: "Oktober 2026",
        income: 10_000_000,
        expense: 2_000_000,
        net: 8_000_000,
      });
      expect(allSummary.monthlySeries[5]).toEqual({
        month: "2026-11",
        label: "November 2026",
        income: 10_500_000,
        expense: 3_500_000,
        net: 7_000_000,
      });

      expect(allSummary.topBudgets).toHaveLength(1);
      expect(allSummary.dueRecurring).toHaveLength(1);
      expect(allSummary.pendingInvites).toHaveLength(1);
      expect(
        allSummary.recentTransactions.some(
          (t) => t.walletId === partnerViewerWallet.id
        )
      ).toBe(false);

      // 2. scope = "personal" excludes sharedKas and partnerEditorWallet
      const personalSummary = getDashboardSummary(
        db,
        owner.user.id,
        owner.user.email,
        { scope: "personal", todayIso: "2026-11-21" }
      );
      expect(personalSummary.scope).toBe("personal");
      expect(personalSummary.activeWallets.map((w) => w.name)).toEqual([
        "Dompet Utama",
        "BCA Pribadi",
      ]);
      expect(personalSummary.watchedWallets.map((w) => w.name)).toEqual([
        "Tabungan Nadia",
      ]);
      // personalBca balance: 5M + 10M - 2M + 10M - 3M - 1.5M = 18.5M
      expect(personalSummary.totalBalance).toBe(18_500_000);
      expect(personalSummary.currentMonthIncome).toBe(10_000_000);
      expect(personalSummary.currentMonthExpense).toBe(3_000_000);
      expect(personalSummary.currentMonthNet).toBe(7_000_000);
      expect(personalSummary.savingRate).toBe(70);
      expect(
        personalSummary.recentTransactions.some(
          (t) => t.walletId === sharedKas.id && t.type === "expense"
        )
      ).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  test("getDashboardSummary works cleanly with demo seed data and returns null balanceGrowthPct when starting balance <= 0", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const demo = await ensureDemoSeeded(db);
      const demoDash = getDashboardSummary(db, demo.id, demo.email);
      expect(demoDash.activeWallets).toHaveLength(4);
      expect(demoDash.watchedWallets).toHaveLength(1);
      expect(demoDash.watchedWallets[0].name).toBe("Tabungan Liburan Nadia");
      expect(demoDash.monthlySeries).toHaveLength(6);
      expect(demoDash.dueRecurring.length).toBeGreaterThanOrEqual(2);

      // Fresh user with 0 initial balance -> balanceGrowthPct is null
      const fresh = await registerUser(db, {
        name: "Baru",
        email: "baru@aruskas.test",
        password: "Password123!",
      });
      const freshDash = getDashboardSummary(db, fresh.user.id, fresh.user.email);
      expect(freshDash.totalBalance).toBe(0);
      expect(freshDash.savingRate).toBe(0);
      expect(freshDash.balanceGrowthPct).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("getFinancialReport for a single wallet reconciles openingBalance + totalIncome - totalExpense + transferIn - transferOut === closingBalance across prior history & in-range flows", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const user = await registerUser(db, {
        name: "Raka",
        email: "raka-single-rep@aruskas.test",
        password: "Password123!",
      });
      const outsider = await registerUser(db, {
        name: "Tamu",
        email: "tamu-single-rep@aruskas.test",
        password: "Password123!",
      });

      const bca = createWallet(db, user.user.id, {
        name: "Bank BCA",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const tunai = createWallet(db, user.user.id, {
        name: "Dompet Tunai",
        type: "cash",
        initialBalance: 2_000_000,
      });

      const gajiCat = getUserCategory(db, user.user.id, "income", 0);
      const bonusCat = getUserCategory(db, user.user.id, "income", 3);
      const makanCat = getUserCategory(db, user.user.id, "expense", 0);
      const transCat = getUserCategory(db, user.user.id, "expense", 1);

      // Prior history strictly before 2026-11-01 on BCA:
      // 1_000_000 + 4_000_000 (income) - 500_000 (expense) + 300_000 (transfer in) - 200_000 (transfer out) = 4_600_000
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: gajiCat.id,
        type: "income",
        amount: 4_000_000,
        title: "Gaji Oktober",
        occurredAt: "2026-10-05",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: makanCat.id,
        type: "expense",
        amount: 500_000,
        title: "Makan Oktober",
        occurredAt: "2026-10-12",
      });
      createTransaction(db, user.user.id, {
        walletId: tunai.id,
        targetWalletId: bca.id,
        type: "transfer",
        amount: 300_000,
        title: "Setor Tunai Oktober",
        occurredAt: "2026-10-20",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        targetWalletId: tunai.id,
        type: "transfer",
        amount: 200_000,
        title: "Tarik Tunai Oktober",
        occurredAt: "2026-10-25",
      });

      // In-range [2026-11-01, 2026-11-30] on BCA:
      // income: 5_000_000 + 1_000_000 = 6_000_000
      // expense: 800_000 + 200_000 = 1_000_000
      // transferIn: 450_000
      // transferOut: 750_000
      // netChange = 6_000_000 - 1_000_000 + 450_000 - 750_000 = 4_700_000
      // closingBalance = 4_600_000 + 4_700_000 = 9_300_000
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: gajiCat.id,
        type: "income",
        amount: 5_000_000,
        title: "Gaji November",
        occurredAt: "2026-11-01",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: bonusCat.id,
        type: "income",
        amount: 1_000_000,
        title: "Bonus Proyek",
        occurredAt: "2026-11-10",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: makanCat.id,
        type: "expense",
        amount: 800_000,
        title: "Katering",
        occurredAt: "2026-11-10",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: transCat.id,
        type: "expense",
        amount: 200_000,
        title: "Tol & Parkir",
        occurredAt: "2026-11-15",
      });
      createTransaction(db, user.user.id, {
        walletId: tunai.id,
        targetWalletId: bca.id,
        type: "transfer",
        amount: 450_000,
        title: "Setor Tunai Nov",
        occurredAt: "2026-11-18",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        targetWalletId: tunai.id,
        type: "transfer",
        amount: 750_000,
        title: "Tarik Tunai Nov",
        occurredAt: "2026-11-22",
      });

      // Post-range (> 2026-11-30) transaction must NOT affect November report
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: gajiCat.id,
        type: "income",
        amount: 3_000_000,
        title: "Gaji Desember",
        occurredAt: "2026-12-01",
      });

      const report = getFinancialReport(db, user.user.id, {
        from: "2026-11-01",
        to: "2026-11-30",
        walletId: bca.id,
      });

      expect(report.isSingleWallet).toBe(true);
      expect(report.walletId).toBe(bca.id);
      expect(report.walletName).toBe("Bank BCA");
      expect(report.openingBalance).toBe(4_600_000);
      expect(report.totalIncome).toBe(6_000_000);
      expect(report.totalExpense).toBe(1_000_000);
      expect(report.transferIn).toBe(450_000);
      expect(report.transferOut).toBe(750_000);
      expect(report.netChange).toBe(4_700_000);
      expect(report.closingBalance).toBe(9_300_000);
      expect(
        report.openingBalance +
          report.totalIncome -
          report.totalExpense +
          report.transferIn -
          report.transferOut
      ).toBe(report.closingBalance);
      expect(report.savingRate).toBe(83.3);
      expect(report.transactionCount).toBe(6);

      // Daily trendSeries (<= 45 days)
      expect(report.trendSeries).toHaveLength(30);
      expect(report.trendSeries[0].period).toBe("2026-11-01");
      expect(report.trendSeries[0].income).toBe(5_000_000);
      const nov10 = report.trendSeries.find((p) => p.period === "2026-11-10")!;
      expect(nov10.income).toBe(1_000_000);
      expect(nov10.expense).toBe(800_000);
      expect(nov10.net).toBe(200_000);

      // Category breakdown sorted descending, transfers excluded
      expect(report.incomeByCategory).toHaveLength(2);
      expect(report.incomeByCategory[0].categoryId).toBe(gajiCat.id);
      expect(report.incomeByCategory[0].total).toBe(5_000_000);
      expect(report.incomeByCategory[0].percentage).toBe(83.3);
      expect(report.incomeByCategory[1].categoryId).toBe(bonusCat.id);
      expect(report.incomeByCategory[1].percentage).toBe(16.7);

      expect(report.expenseByCategory).toHaveLength(2);
      expect(report.expenseByCategory[0].categoryId).toBe(makanCat.id);
      expect(report.expenseByCategory[0].total).toBe(800_000);
      expect(report.expenseByCategory[0].percentage).toBe(80);
      expect(report.expenseByCategory[1].percentage).toBe(20);

      // Multi-month range (> 45 days) groups trendSeries by YYYY-MM
      const multiMonth = getFinancialReport(db, user.user.id, {
        from: "2026-10-01",
        to: "2026-12-31",
        walletId: bca.id,
      });
      expect(multiMonth.trendSeries.map((p) => p.period)).toEqual([
        "2026-10",
        "2026-11",
        "2026-12",
      ]);
      expect(multiMonth.openingBalance).toBe(1_000_000);
      expect(multiMonth.closingBalance).toBe(12_300_000);

      // Unauthorized user gets 403; inverted date range gets 400
      await expectAppError(
        () =>
          getFinancialReport(db, outsider.user.id, {
            from: "2026-11-01",
            to: "2026-11-30",
            walletId: bca.id,
          }),
        403
      );
      await expectAppError(
        () =>
          getFinancialReport(db, user.user.id, {
            from: "2026-11-30",
            to: "2026-11-01",
            walletId: bca.id,
          }),
        400
      );
    } finally {
      sqlite.close();
    }
  });

  test("aggregate getFinancialReport excludes internal transfers from income/expense, excludes viewer wallets, and reconciles openingBalance -> closingBalance in all & personal scopes", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka-agg@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia-agg@aruskas.test",
        password: "Password123!",
      });

      const bca = createWallet(db, owner.user.id, {
        name: "BCA Pribadi",
        type: "bank",
        initialBalance: 2_000_000,
      });
      const gopay = createWallet(db, owner.user.id, {
        name: "GoPay",
        type: "ewallet",
        initialBalance: 500_000,
      });
      const kasShared = createWallet(db, owner.user.id, {
        name: "Kas Keluarga",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const partnerViewer = createWallet(db, partner.user.id, {
        name: "Tabungan Nadia",
        type: "savings",
        initialBalance: 10_000_000,
      });

      const sharedInv = createWalletInvite(db, kasShared.id, owner.user.id, {
        email: partner.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, sharedInv.token, partner.user);

      const viewerInv = createWalletInvite(
        db,
        partnerViewer.id,
        partner.user.id,
        {
          email: owner.user.email,
          role: "viewer",
        }
      );
      acceptWalletInvite(db, viewerInv.token, owner.user);

      const incomeCat = getUserCategory(db, owner.user.id, "income", 0);
      const expenseCat = getUserCategory(db, owner.user.id, "expense", 0);
      const partnerIncomeCat = getUserCategory(db, partner.user.id, "income", 0);

      // Prior (2026-10) income on BCA + internal transfer BCA -> GoPay
      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        categoryId: incomeCat.id,
        type: "income",
        amount: 3_000_000,
        title: "Gaji Okt",
        occurredAt: "2026-10-01",
      });
      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        targetWalletId: gopay.id,
        type: "transfer",
        amount: 400_000,
        title: "TopUp Okt",
        occurredAt: "2026-10-05",
      });

      // Nov 2026 transactions
      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        categoryId: incomeCat.id,
        type: "income",
        amount: 8_000_000,
        title: "Gaji Nov",
        occurredAt: "2026-11-01",
      });
      // Internal transfer BCA -> GoPay (must cancel out completely!)
      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        targetWalletId: gopay.id,
        type: "transfer",
        amount: 1_000_000,
        title: "TopUp GoPay Nov",
        occurredAt: "2026-11-03",
      });
      // Transfer BCA -> kasShared (internal in scope='all', boundary OUT in scope='personal')
      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        targetWalletId: kasShared.id,
        type: "transfer",
        amount: 1_500_000,
        title: "Setor Kas Keluarga",
        occurredAt: "2026-11-05",
      });
      // Expense on GoPay & kasShared
      createTransaction(db, owner.user.id, {
        walletId: gopay.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 600_000,
        title: "Makan GoFood",
        occurredAt: "2026-11-08",
      });
      createTransaction(db, partner.user.id, {
        walletId: kasShared.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 400_000,
        title: "Belanja Bersama",
        occurredAt: "2026-11-09",
      });
      // Viewer wallet activity -> MUST NOT affect aggregate report
      createTransaction(db, partner.user.id, {
        walletId: partnerViewer.id,
        categoryId: partnerIncomeCat.id,
        type: "income",
        amount: 99_000_000,
        title: "Gaji Nadia",
        occurredAt: "2026-11-10",
      });

      // 1. Aggregate scope = "all"
      const aggAll = getFinancialReport(db, owner.user.id, {
        from: "2026-11-01",
        to: "2026-11-30",
        scope: "all",
      });
      expect(aggAll.isSingleWallet).toBe(false);
      expect(aggAll.walletId).toBeNull();
      expect(aggAll.walletName).toBeNull();
      // Opening = 2_000_000 + 500_000 + 1_000_000 + 3_000_000 = 6_500_000
      expect(aggAll.openingBalance).toBe(6_500_000);
      expect(aggAll.totalIncome).toBe(8_000_000);
      expect(aggAll.totalExpense).toBe(1_000_000);
      // Both transfers are internal to active set -> transferIn = 0, transferOut = 0
      expect(aggAll.transferIn).toBe(0);
      expect(aggAll.transferOut).toBe(0);
      expect(aggAll.netChange).toBe(7_000_000);
      expect(aggAll.closingBalance).toBe(13_500_000);
      expect(
        aggAll.openingBalance +
          aggAll.totalIncome -
          aggAll.totalExpense +
          aggAll.transferIn -
          aggAll.transferOut
      ).toBe(aggAll.closingBalance);
      expect(
        aggAll.transactions.some((t) => t.walletId === partnerViewer.id)
      ).toBe(false);

      // 2. Aggregate scope = "personal"
      const aggPersonal = getFinancialReport(db, owner.user.id, {
        from: "2026-11-01",
        to: "2026-11-30",
        scope: "personal",
      });
      // Personal active set: Dompet Utama (0) + BCA (2M + 3M - 400k = 4.6M) + GoPay (500k + 400k = 900k) = 5.5M
      expect(aggPersonal.openingBalance).toBe(5_500_000);
      expect(aggPersonal.totalIncome).toBe(8_000_000);
      expect(aggPersonal.totalExpense).toBe(600_000);
      // BCA -> GoPay cancels out; BCA -> kasShared is boundary transferOut = 1.5M
      expect(aggPersonal.transferIn).toBe(0);
      expect(aggPersonal.transferOut).toBe(1_500_000);
      expect(aggPersonal.netChange).toBe(5_900_000);
      expect(aggPersonal.closingBalance).toBe(11_400_000);
      expect(
        aggPersonal.openingBalance +
          aggPersonal.totalIncome -
          aggPersonal.totalExpense +
          aggPersonal.transferIn -
          aggPersonal.transferOut
      ).toBe(aggPersonal.closingBalance);
    } finally {
      sqlite.close();
    }
  });

  test("Review Focus: buildTransactionsCsv starts with UTF-8 BOM, has Indonesian headers, and neutralizes formula-injection payloads", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const user = await registerUser(db, {
        name: "Raka",
        email: "raka-csv@aruskas.test",
        password: "Password123!",
      });
      const bca = createWallet(db, user.user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 5_000_000,
      });
      const tunai = createWallet(db, user.user.id, {
        name: "Dompet Tunai",
        type: "cash",
        initialBalance: 1_000_000,
      });
      const expenseCat = getUserCategory(db, user.user.id, "expense", 0);

      createTransaction(db, user.user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 25_000,
        title: '=HYPERLINK("http://evil","x")',
        notes: "+123",
        paymentMethod: "@CMD",
        occurredAt: "2026-11-15",
      });
      createTransaction(db, user.user.id, {
        walletId: bca.id,
        targetWalletId: tunai.id,
        type: "transfer",
        amount: 100_000,
        title: "-456",
        occurredAt: "2026-11-14",
      });

      const rows = listTransactions(db, user.user.id, {}).items;
      const csv = buildTransactionsCsv(rows);

      expect(csv.startsWith("\uFEFF")).toBe(true);
      const lines = csv.slice(1).split(/\r?\n/);
      expect(lines[0]).toBe(
        "Tanggal,Judul,Tipe,Nominal (IDR),Dompet Asal,Dompet Tujuan,Kategori,Pencatat,Metode Pembayaran,Catatan"
      );
      expect(lines).toHaveLength(3);

      // Neutralized =HYPERLINK(...) with leading ' and RFC 4180 quote escaping
      expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil"",""x"")"');
      expect(lines[1]).toContain("'+123");
      expect(lines[1]).toContain("'@CMD");
      expect(lines[1]).toContain("Pengeluaran");

      // Neutralized -456
      expect(lines[2]).toContain("'-456");
      expect(lines[2]).toContain("Transfer");

      // Backup JSON snapshot check
      upsertBudget(db, user.user.id, {
        categoryId: expenseCat.id,
        month: "2026-11",
        limitAmount: 2_000_000,
      });
      createSavingsGoal(db, user.user.id, {
        name: "Dana Darurat",
        targetAmount: 10_000_000,
      });
      createRecurringRule(db, user.user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 100_000,
        title: "Langganan",
        frequency: "monthly",
        nextRunDate: "2026-12-01",
      });

      const backup = buildUserBackupJson(db, user.user);
      expect(backup.user.email).toBe("raka-csv@aruskas.test");
      expect((backup.user as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(backup.wallets.length).toBeGreaterThanOrEqual(3);
      expect(backup.categories).toHaveLength(12);
      expect(backup.transactions).toHaveLength(2);
      expect(backup.budgets).toHaveLength(1);
      expect(backup.savingsGoals).toHaveLength(1);
      expect(backup.recurringRules).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("API routes enforce 401, Indonesian 400 validation errors, 403 RBAC, and correct JSON/CSV/Backup download headers", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-rep-api-"));
    process.env.DATABASE_PATH = path.join(tempDir, "test.db");
    mockSessionCookie = undefined;

    try {
      const db = getDb();
      const owner = await registerUser(db, {
        name: "Raka API",
        email: "raka-rep-api@aruskas.test",
        password: "Password123!",
      });
      const outsider = await registerUser(db, {
        name: "Tamu API",
        email: "tamu-rep-api@aruskas.test",
        password: "Password123!",
      });

      // 1. Unauthenticated -> 401 across all 4 routes
      expect(
        (await getDashboardRoute(new Request("http://localhost/api/dashboard")))
          .status
      ).toBe(401);
      expect(
        (await getReportsRoute(new Request("http://localhost/api/reports")))
          .status
      ).toBe(401);
      expect(
        (
          await exportReportsCsvRoute(
            new Request("http://localhost/api/reports/export/csv")
          )
        ).status
      ).toBe(401);
      expect((await getBackupRoute()).status).toBe(401);

      // Authenticate as owner
      mockSessionCookie = owner.token;

      const bca = createWallet(db, owner.user.id, {
        name: "BCA Uji",
        type: "bank",
        initialBalance: 3_000_000,
      });
      const incomeCat = getUserCategory(db, owner.user.id, "income", 0);
      const expenseCat = getUserCategory(db, owner.user.id, "expense", 0);

      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        categoryId: incomeCat.id,
        type: "income",
        amount: 2_000_000,
        title: "Gaji Uji",
        occurredAt: "2026-11-05",
      });
      createTransaction(db, owner.user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 500_000,
        title: '=CMD("calc")',
        occurredAt: "2026-11-10",
      });

      // 2. Indonesian query param validation errors -> 400
      const badDashScope = await getDashboardRoute(
        new Request("http://localhost/api/dashboard?scope=team")
      );
      expect(badDashScope.status).toBe(400);
      const badDashBody = (await badDashScope.json()) as { error: string };
      expect(badDashBody.error).not.toMatch(/Invalid enum value/i);

      const badReportDate = await getReportsRoute(
        new Request("http://localhost/api/reports?from=2026-02-30&to=2026-11-30")
      );
      expect(badReportDate.status).toBe(400);
      expect(((await badReportDate.json()) as { error: string }).error).toBe(
        "Tanggal tidak valid."
      );

      const invertedReportRange = await getReportsRoute(
        new Request(
          "http://localhost/api/reports?from=2026-11-25&to=2026-11-01"
        )
      );
      expect(invertedReportRange.status).toBe(400);
      expect(
        ((await invertedReportRange.json()) as { error: string }).error
      ).toBe("Tanggal awal tidak boleh melebihi tanggal akhir.");

      const badCsvScope = await exportReportsCsvRoute(
        new Request(
          "http://localhost/api/reports/export/csv?from=2026-11-01&to=2026-11-30&scope=global"
        )
      );
      expect(badCsvScope.status).toBe(400);
      expect(((await badCsvScope.json()) as { error: string }).error).not.toMatch(
        /Invalid enum value/i
      );

      // 3. Valid Dashboard GET
      const dashRes = await getDashboardRoute(
        new Request("http://localhost/api/dashboard?scope=personal")
      );
      expect(dashRes.status).toBe(200);
      const dashJson = (await dashRes.json()) as {
        scope: string;
        totalBalance: number;
      };
      expect(dashJson.scope).toBe("personal");
      expect(dashJson.totalBalance).toBe(4_500_000);

      // 4. Valid Reports GET & RBAC 403 for outsider
      const repRes = await getReportsRoute(
        new Request(
          `http://localhost/api/reports?from=2026-11-01&to=2026-11-30&walletId=${bca.id}`
        )
      );
      expect(repRes.status).toBe(200);
      const repJson = (await repRes.json()) as {
        openingBalance: number;
        totalIncome: number;
        totalExpense: number;
        closingBalance: number;
      };
      expect(repJson.openingBalance).toBe(3_000_000);
      expect(repJson.totalIncome).toBe(2_000_000);
      expect(repJson.totalExpense).toBe(500_000);
      expect(repJson.closingBalance).toBe(4_500_000);

      mockSessionCookie = outsider.token;
      const forbiddenRepRes = await getReportsRoute(
        new Request(
          `http://localhost/api/reports?from=2026-11-01&to=2026-11-30&walletId=${bca.id}`
        )
      );
      expect(forbiddenRepRes.status).toBe(403);

      // 5. CSV Export Download Headers & Content
      mockSessionCookie = owner.token;
      const csvRes = await exportReportsCsvRoute(
        new Request(
          `http://localhost/api/reports/export/csv?from=2026-11-01&to=2026-11-30&walletId=${bca.id}`
        )
      );
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers.get("content-type")).toBe(
        "text/csv; charset=utf-8"
      );
      expect(csvRes.headers.get("content-disposition")).toBe(
        'attachment; filename="laporan-aruskas-2026-11-01-2026-11-30.csv"'
      );
      const csvText = await csvRes.text();
      expect(csvText.startsWith("\uFEFF")).toBe(true);
      expect(csvText).toContain("'=CMD(\"\"calc\"\")");

      // 6. Backup JSON Download Headers & Content
      const backupRes = await getBackupRoute();
      expect(backupRes.status).toBe(200);
      expect(backupRes.headers.get("content-type")).toBe(
        "application/json; charset=utf-8"
      );
      expect(backupRes.headers.get("content-disposition")).toBe(
        `attachment; filename="backup-aruskas-${getTodayISO()}.json"`
      );
      const backupJson = (await backupRes.json()) as {
        user: { email: string; passwordHash?: string };
        transactions: unknown[];
      };
      expect(backupJson.user.email).toBe("raka-rep-api@aruskas.test");
      expect(backupJson.user.passwordHash).toBeUndefined();
      expect(backupJson.transactions).toHaveLength(2);

      // 7. Non-object JSON arrays rejected with Indonesian message across auth & settings routes
      for (const res of [
        await loginRoute(
          new Request("http://localhost/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "[]",
          })
        ),
        await registerRoute(
          new Request("http://localhost/api/auth/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "[]",
          })
        ),
        await updateProfileRoute(
          new Request("http://localhost/api/settings/profile", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: "[]",
          })
        ),
        await changePasswordRoute(
          new Request("http://localhost/api/settings/password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "[]",
          })
        ),
      ]) {
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe(
          "Format data permintaan tidak valid."
        );
      }
    } finally {
      closeDb();
      mockSessionCookie = undefined;
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows SQLite temp lock
      }
    }
  });
});
