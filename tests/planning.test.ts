import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, getDb } from "@/db";
import { categories, transactions, wallets } from "@/db/schema";
import { SESSION_COOKIE_NAME, registerUser } from "@/lib/auth";
import {
  copyBudgetsFromPreviousMonth,
  deleteBudget,
  listMonthlyBudgets,
  upsertBudget,
} from "@/lib/budgets";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/lib/categories";
import { AppError } from "@/lib/errors";
import {
  createSavingsGoal,
  deleteSavingsGoal,
  depositToSavingsGoal,
  listSavingsGoals,
  updateSavingsGoal,
} from "@/lib/goals";
import { createRecurringRule } from "@/lib/recurring";
import { createTransaction, listTransactions } from "@/lib/transactions";
import {
  acceptWalletInvite,
  createWallet,
  createWalletInvite,
  removeWalletMember,
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

import { DELETE as deleteBudgetRoute } from "@/app/api/budgets/[id]/route";
import { POST as copyBudgetsRoute } from "@/app/api/budgets/copy/route";
import {
  GET as listBudgetsRoute,
  POST as upsertBudgetRoute,
} from "@/app/api/budgets/route";
import {
  DELETE as deleteCategoryRoute,
  PATCH as updateCategoryRoute,
} from "@/app/api/categories/[id]/route";
import {
  GET as listCategoriesRoute,
  POST as createCategoryRoute,
} from "@/app/api/categories/route";
import { POST as depositGoalRoute } from "@/app/api/goals/[id]/deposit/route";
import {
  DELETE as deleteGoalRoute,
  PATCH as updateGoalRoute,
} from "@/app/api/goals/[id]/route";
import {
  GET as listGoalsRoute,
  POST as createGoalRoute,
} from "@/app/api/goals/route";

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

function getWalletBalance(
  db: ReturnType<typeof createDb>["db"],
  walletId: string
): number {
  const row = db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .get();
  expect(row).toBeDefined();
  return row!.balance;
}

describe("Categories, Monthly Budgets & Dual-Mode Savings Goals", () => {
  test("categories: list (with type & shared ownerId guard), create, update, and Review Focus 409 delete guard", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka-cat@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia-cat@aruskas.test",
        password: "Password123!",
      });
      const outsider = await registerUser(db, {
        name: "Tamu",
        email: "tamu-cat@aruskas.test",
        password: "Password123!",
      });

      const sharedWallet = createWallet(db, owner.user.id, {
        name: "Kas Bersama",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const invite = createWalletInvite(db, sharedWallet.id, owner.user.id, {
        email: partner.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, invite.token, partner.user);

      // Default categories seeded: 5 income + 7 expense = 12
      const allOwnerCats = listCategories(db, owner.user.id);
      expect(allOwnerCats).toHaveLength(12);
      const expenseCats = listCategories(db, owner.user.id, {
        type: "expense",
      });
      expect(expenseCats).toHaveLength(7);
      expect(expenseCats.every((c) => c.type === "expense")).toBe(true);

      // Shared wallet partner can read owner's categories via ownerId
      const partnerViewingOwnerCats = listCategories(db, partner.user.id, {
        ownerId: owner.user.id,
        type: "expense",
      });
      expect(partnerViewingOwnerCats).toHaveLength(7);
      expect(partnerViewingOwnerCats.every((c) => c.userId === owner.user.id)).toBe(
        true
      );

      // Outsider sharing no wallet owned by owner gets 403
      await expectAppError(
        () =>
          listCategories(db, outsider.user.id, {
            ownerId: owner.user.id,
          }),
        403
      );

      // Create custom category with defaults and explicit values
      const customA = createCategory(db, owner.user.id, {
        name: "  Langganan Cloud  ",
        type: "expense",
      });
      expect(customA.name).toBe("Langganan Cloud");
      expect(customA.type).toBe("expense");
      expect(customA.isDefault).toBe(false);
      expect(customA.icon.length).toBeGreaterThan(0);
      expect(customA.color.length).toBeGreaterThan(0);

      const customB = createCategory(db, owner.user.id, {
        name: "Royalti Buku",
        type: "income",
        icon: "BookOpen",
        color: "#0ea5e9",
      });
      expect(customB.icon).toBe("BookOpen");
      expect(customB.color).toBe("#0ea5e9");

      // Blank name -> 400
      await expectAppError(
        () =>
          createCategory(db, owner.user.id, {
            name: "   ",
            type: "expense",
          }),
        400
      );

      // Update category
      const updated = updateCategory(db, owner.user.id, customA.id, {
        name: "Cloud & Domain",
        color: "#0284c7",
      });
      expect(updated.name).toBe("Cloud & Domain");
      expect(updated.color).toBe("#0284c7");

      // Non-owner cannot update or delete -> 403
      await expectAppError(
        () =>
          updateCategory(db, partner.user.id, customA.id, {
            name: "Dibajak",
          }),
        403
      );
      await expectAppError(
        () => deleteCategory(db, partner.user.id, customA.id),
        403
      );
      await expectAppError(
        () => deleteCategory(db, owner.user.id, "kategori-tidak-ada"),
        404
      );

      // Review Focus: Deleting category referenced by a transaction throws AppError(409) mentioning usage count
      createTransaction(db, owner.user.id, {
        walletId: sharedWallet.id,
        categoryId: customA.id,
        type: "expense",
        amount: 150_000,
        title: "Sewa VPS",
        occurredAt: "2026-11-10",
      });

      const txRefErr = await expectAppError(
        () => deleteCategory(db, owner.user.id, customA.id),
        409
      );
      expect(txRefErr.message).toBe(
        "Kategori masih digunakan pada 1 data (transaksi/anggaran/jadwal rutin) dan tidak dapat dihapus."
      );

      // Also referenced by budget and recurring rule -> total count = 3
      upsertBudget(db, owner.user.id, {
        categoryId: customA.id,
        month: "2026-11",
        limitAmount: 500_000,
      });
      createRecurringRule(db, owner.user.id, {
        walletId: sharedWallet.id,
        categoryId: customA.id,
        type: "expense",
        amount: 150_000,
        title: "VPS Bulanan",
        frequency: "monthly",
        nextRunDate: "2026-12-10",
      });

      const multiRefErr = await expectAppError(
        () => deleteCategory(db, owner.user.id, customA.id),
        409
      );
      expect(multiRefErr.message).toBe(
        "Kategori masih digunakan pada 3 data (transaksi/anggaran/jadwal rutin) dan tidak dapat dihapus."
      );

      // Deleting unreferenced category succeeds cleanly
      deleteCategory(db, owner.user.id, customB.id);
      const afterDelete = listCategories(db, owner.user.id);
      expect(afterDelete.some((c) => c.id === customB.id)).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  test("budgets: realization across owned wallets only (ignores transfer & viewer wallets), thresholds (<80%, 80-100%, >100%), upsert & copy idempotency", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const user = await registerUser(db, {
        name: "Raka",
        email: "raka-budget@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia-budget@aruskas.test",
        password: "Password123!",
      });

      const personalWallet = createWallet(db, user.user.id, {
        name: "BCA Pribadi",
        type: "bank",
        initialBalance: 10_000_000,
      });
      const sharedOwnedWallet = createWallet(db, user.user.id, {
        name: "Kas Keluarga",
        type: "cash",
        initialBalance: 5_000_000,
      });
      const partnerWallet = createWallet(db, partner.user.id, {
        name: "Tabungan Nadia",
        type: "bank",
        initialBalance: 5_000_000,
      });

      // Partner is editor on user's sharedOwnedWallet
      const invPartner = createWalletInvite(
        db,
        sharedOwnedWallet.id,
        user.user.id,
        { email: partner.user.email, role: "editor" }
      );
      acceptWalletInvite(db, invPartner.token, partner.user);

      // User is viewer on partnerWallet
      const invViewer = createWalletInvite(
        db,
        partnerWallet.id,
        partner.user.id,
        { email: user.user.email, role: "viewer" }
      );
      acceptWalletInvite(db, invViewer.token, user.user);

      // Also test editor on someone else's wallet (not owned by user) -> must still be excluded
      const partnerWalletEditor = createWallet(db, partner.user.id, {
        name: "Proyek Nadia",
        type: "bank",
        initialBalance: 2_000_000,
      });
      const invEditorOther = createWalletInvite(
        db,
        partnerWalletEditor.id,
        partner.user.id,
        { email: user.user.email, role: "editor" }
      );
      acceptWalletInvite(db, invEditorOther.token, user.user);

      const expenseCats = listCategories(db, user.user.id, { type: "expense" });
      const incomeCat = listCategories(db, user.user.id, { type: "income" })[0];
      const partnerExpenseCat = listCategories(db, partner.user.id, {
        type: "expense",
      })[0];

      const catSafe = expenseCats[0];
      const catWarn80 = expenseCats[1];
      const catWarn100 = expenseCats[2];
      const catExceeded = expenseCats[3];

      // Cannot create budget for income category or invalid month or non-positive amount
      await expectAppError(
        () =>
          upsertBudget(db, user.user.id, {
            categoryId: incomeCat.id,
            month: "2026-11",
            limitAmount: 1_000_000,
          }),
        400
      );
      await expectAppError(
        () =>
          upsertBudget(db, user.user.id, {
            categoryId: catSafe.id,
            month: "2026-13",
            limitAmount: 1_000_000,
          }),
        400
      );
      await expectAppError(
        () =>
          upsertBudget(db, user.user.id, {
            categoryId: catSafe.id,
            month: "2026-11",
            limitAmount: 0,
          }),
        400
      );
      await expectAppError(
        () =>
          upsertBudget(db, user.user.id, {
            categoryId: partnerExpenseCat.id,
            month: "2026-11",
            limitAmount: 1_000_000,
          }),
        403
      );

      // Upsert budgets in 2026-11 (plus update existing limit via upsert)
      upsertBudget(db, user.user.id, {
        categoryId: catSafe.id,
        month: "2026-11",
        limitAmount: 500_000,
      });
      const upsertedSafe = upsertBudget(db, user.user.id, {
        categoryId: catSafe.id,
        month: "2026-11",
        limitAmount: 1_000_000,
      });
      expect(upsertedSafe.limitAmount).toBe(1_000_000);

      upsertBudget(db, user.user.id, {
        categoryId: catWarn80.id,
        month: "2026-11",
        limitAmount: 1_000_000,
      });
      upsertBudget(db, user.user.id, {
        categoryId: catWarn100.id,
        month: "2026-11",
        limitAmount: 1_000_000,
      });
      upsertBudget(db, user.user.id, {
        categoryId: catExceeded.id,
        month: "2026-11",
        limitAmount: 1_000_000,
      });

      // Expenses in 2026-11:
      // 1. catSafe: 799.000 in personalWallet (79.9% -> "safe", NOT rounded up to 80!)
      createTransaction(db, user.user.id, {
        walletId: personalWallet.id,
        categoryId: catSafe.id,
        type: "expense",
        amount: 799_000,
        title: "Makan Harian",
        occurredAt: "2026-11-05",
      });

      // Also expense in another month (2026-10) -> must NOT count toward 2026-11
      createTransaction(db, user.user.id, {
        walletId: personalWallet.id,
        categoryId: catSafe.id,
        type: "expense",
        amount: 500_000,
        title: "Makan Bulan Lalu",
        occurredAt: "2026-10-28",
      });

      // Transfer -> must NOT count
      createTransaction(db, user.user.id, {
        walletId: personalWallet.id,
        targetWalletId: sharedOwnedWallet.id,
        type: "transfer",
        amount: 900_000,
        title: "Transfer Kas",
        occurredAt: "2026-11-06",
      });

      // Viewer wallet expense by partner -> must NOT count in user's budget
      createTransaction(db, partner.user.id, {
        walletId: partnerWallet.id,
        categoryId: partnerExpenseCat.id,
        type: "expense",
        amount: 500_000,
        title: "Pengeluaran Partner",
        occurredAt: "2026-11-07",
      });
      // Even if partner somehow logged using user's category on partner's own wallet (impossible via API, simulate raw DB row to verify wallets.ownerId filter!)
      db.insert(transactions)
        .values({
          id: crypto.randomUUID(),
          walletId: partnerWallet.id,
          categoryId: catSafe.id,
          userId: partner.user.id,
          type: "expense",
          amount: 500_000,
          title: "Viewer Wallet Expense",
          occurredAt: "2026-11-08",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // 2. catWarn80: 500.000 by user in personal + 300.000 by partner in sharedOwnedWallet = 800.000 (80% -> "warning")
      createTransaction(db, user.user.id, {
        walletId: personalWallet.id,
        categoryId: catWarn80.id,
        type: "expense",
        amount: 500_000,
        title: "Bensin",
        occurredAt: "2026-11-09",
      });
      createTransaction(db, partner.user.id, {
        walletId: sharedOwnedWallet.id,
        categoryId: catWarn80.id,
        type: "expense",
        amount: 300_000,
        title: "Tol Bersama",
        occurredAt: "2026-11-10",
      });

      // 3. catWarn100: exactly 1.000.000 (100% -> "warning")
      createTransaction(db, user.user.id, {
        walletId: sharedOwnedWallet.id,
        categoryId: catWarn100.id,
        type: "expense",
        amount: 1_000_000,
        title: "Belanja Bulanan",
        occurredAt: "2026-11-11",
      });

      // 4. catExceeded: 1.000.100 (>100% -> "exceeded")
      createTransaction(db, user.user.id, {
        walletId: personalWallet.id,
        categoryId: catExceeded.id,
        type: "expense",
        amount: 1_000_100,
        title: "Tagihan Listrik & AC",
        occurredAt: "2026-11-12",
      });

      const progress = listMonthlyBudgets(db, user.user.id, "2026-11");
      expect(progress).toHaveLength(4);

      const safeView = progress.find((b) => b.categoryId === catSafe.id)!;
      expect(safeView.spentAmount).toBe(799_000);
      expect(safeView.remainingAmount).toBe(201_000);
      expect(safeView.status).toBe("safe");

      const warn80View = progress.find((b) => b.categoryId === catWarn80.id)!;
      expect(warn80View.spentAmount).toBe(800_000);
      expect(warn80View.remainingAmount).toBe(200_000);
      expect(warn80View.percentage).toBe(80);
      expect(warn80View.status).toBe("warning");

      const warn100View = progress.find((b) => b.categoryId === catWarn100.id)!;
      expect(warn100View.spentAmount).toBe(1_000_000);
      expect(warn100View.remainingAmount).toBe(0);
      expect(warn100View.percentage).toBe(100);
      expect(warn100View.status).toBe("warning");

      const exceededView = progress.find(
        (b) => b.categoryId === catExceeded.id
      )!;
      expect(exceededView.spentAmount).toBe(1_000_100);
      expect(exceededView.remainingAmount).toBe(-100);
      expect(exceededView.status).toBe("exceeded");

      // Copy budgets from 2026-11 to 2026-12 when 2026-12 already has 1 override
      upsertBudget(db, user.user.id, {
        categoryId: catSafe.id,
        month: "2026-12",
        limitAmount: 1_500_000,
      });

      const firstCopy = copyBudgetsFromPreviousMonth(
        db,
        user.user.id,
        "2026-12"
      );
      expect(firstCopy).toEqual({ copiedCount: 3 });

      const decBudgets = listMonthlyBudgets(db, user.user.id, "2026-12");
      expect(decBudgets).toHaveLength(4);
      expect(
        decBudgets.find((b) => b.categoryId === catSafe.id)!.limitAmount
      ).toBe(1_500_000);

      // Idempotent second call copies 0
      const secondCopy = copyBudgetsFromPreviousMonth(
        db,
        user.user.id,
        "2026-12"
      );
      expect(secondCopy).toEqual({ copiedCount: 0 });

      // Year-boundary copy: 2026-12 -> 2027-01
      const janCopy = copyBudgetsFromPreviousMonth(db, user.user.id, "2027-01");
      expect(janCopy).toEqual({ copiedCount: 4 });

      // Delete budget ownership & removal
      await expectAppError(
        () => deleteBudget(db, partner.user.id, safeView.id),
        403
      );
      await expectAppError(
        () => deleteBudget(db, user.user.id, "budget-missing"),
        404
      );
      deleteBudget(db, user.user.id, safeView.id);
      expect(listMonthlyBudgets(db, user.user.id, "2026-11")).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });

  test("savings goals: CRUD + dual-mode deposit (wallet_transfer linked transfer, unlinked/same-wallet expense category, virtual, and atomic rollback)", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const user = await registerUser(db, {
        name: "Raka",
        email: "raka-goal@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia-goal@aruskas.test",
        password: "Password123!",
      });

      const checkingWallet = createWallet(db, user.user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 10_000_000,
      });
      const savingsWallet = createWallet(db, user.user.id, {
        name: "Tabungan Pendidikan",
        type: "savings",
        initialBalance: 2_000_000,
      });
      const partnerViewerWallet = createWallet(db, partner.user.id, {
        name: "Dompet Nadia",
        type: "savings",
        initialBalance: 3_000_000,
      });
      const viewerInv = createWalletInvite(
        db,
        partnerViewerWallet.id,
        partner.user.id,
        { email: user.user.email, role: "viewer" }
      );
      acceptWalletInvite(db, viewerInv.token, user.user);

      // Cannot link goal to wallet where user only has viewer access -> 403
      await expectAppError(
        () =>
          createSavingsGoal(db, user.user.id, {
            name: "Goal Ilegal",
            targetAmount: 5_000_000,
            walletId: partnerViewerWallet.id,
          }),
        403
      );

      // Create linked goal & unlinked goal
      const linkedGoal = createSavingsGoal(db, user.user.id, {
        name: "Dana Darurat",
        targetAmount: 10_000_000,
        currentAmount: 2_000_000,
        walletId: savingsWallet.id,
        deadline: "2027-12-31",
        notes: "Cadangan keluarga",
      });
      expect(linkedGoal.walletName).toBe("Tabungan Pendidikan");
      expect(linkedGoal.remainingAmount).toBe(8_000_000);
      expect(linkedGoal.percentage).toBe(20);

      const unlinkedGoal = createSavingsGoal(db, user.user.id, {
        name: "Laptop Kerja",
        targetAmount: 8_000_000,
      });
      expect(unlinkedGoal.walletId).toBeNull();
      expect(unlinkedGoal.walletName).toBeNull();
      expect(unlinkedGoal.currentAmount).toBe(0);

      expect(listSavingsGoals(db, user.user.id)).toHaveLength(2);

      // Mode 1: wallet_transfer on linkedGoal (source != goal.walletId)
      const afterLinkedTransfer = depositToSavingsGoal(
        db,
        user.user.id,
        linkedGoal.id,
        {
          amount: 1_500_000,
          mode: "wallet_transfer",
          sourceWalletId: checkingWallet.id,
          occurredAt: "2026-11-15",
          notes: "Sisihan gaji November",
        }
      );
      expect(afterLinkedTransfer.currentAmount).toBe(3_500_000);
      expect(afterLinkedTransfer.remainingAmount).toBe(6_500_000);
      expect(getWalletBalance(db, checkingWallet.id)).toBe(8_500_000);
      expect(getWalletBalance(db, savingsWallet.id)).toBe(3_500_000);

      const txAfterLinked = listTransactions(db, user.user.id, {});
      expect(txAfterLinked.items).toHaveLength(1);
      expect(txAfterLinked.items[0].type).toBe("transfer");
      expect(txAfterLinked.items[0].title).toBe("Setoran Target: Dana Darurat");
      expect(txAfterLinked.items[0].walletId).toBe(checkingWallet.id);
      expect(txAfterLinked.items[0].targetWalletId).toBe(savingsWallet.id);

      // Mode 2: wallet_transfer on unlinkedGoal -> creates/reuses "Tabungan & Investasi" expense category & expense tx
      const afterUnlinkedTransfer = depositToSavingsGoal(
        db,
        user.user.id,
        unlinkedGoal.id,
        {
          amount: 1_000_000,
          mode: "wallet_transfer",
          sourceWalletId: checkingWallet.id,
          occurredAt: "2026-11-16",
        }
      );
      expect(afterUnlinkedTransfer.currentAmount).toBe(1_000_000);
      expect(getWalletBalance(db, checkingWallet.id)).toBe(7_500_000);

      // Second deposit on same-wallet goal (goal.walletId === sourceWalletId) must reuse existing "Tabungan & Investasi"
      const updatedGoalSameWallet = updateSavingsGoal(
        db,
        user.user.id,
        unlinkedGoal.id,
        { walletId: checkingWallet.id }
      );
      expect(updatedGoalSameWallet.walletId).toBe(checkingWallet.id);

      const afterSameWalletDeposit = depositToSavingsGoal(
        db,
        user.user.id,
        unlinkedGoal.id,
        {
          amount: 500_000,
          mode: "wallet_transfer",
          sourceWalletId: checkingWallet.id,
          occurredAt: "2026-11-17",
        }
      );
      expect(afterSameWalletDeposit.currentAmount).toBe(1_500_000);
      expect(getWalletBalance(db, checkingWallet.id)).toBe(7_000_000);

      const savingsCats = db
        .select()
        .from(categories)
        .where(eq(categories.userId, user.user.id))
        .all()
        .filter((c) => c.name === "Tabungan & Investasi");
      expect(savingsCats).toHaveLength(1);
      expect(savingsCats[0].type).toBe("expense");

      const allTx = listTransactions(db, user.user.id, {});
      expect(allTx.items).toHaveLength(3);
      const expenseDeposits = allTx.items.filter((t) => t.type === "expense");
      expect(expenseDeposits).toHaveLength(2);
      expect(expenseDeposits[0].title).toBe("Setoran Target: Laptop Kerja");
      expect(expenseDeposits[0].categoryId).toBe(savingsCats[0].id);

      // Mode 3: virtual deposit updates currentAmount ONLY without changing any wallet or creating transaction
      const afterVirtual = depositToSavingsGoal(
        db,
        user.user.id,
        linkedGoal.id,
        {
          amount: 500_000,
          mode: "virtual",
        }
      );
      expect(afterVirtual.currentAmount).toBe(4_000_000);
      expect(getWalletBalance(db, checkingWallet.id)).toBe(7_000_000);
      expect(getWalletBalance(db, savingsWallet.id)).toBe(3_500_000);
      expect(listTransactions(db, user.user.id, {}).items).toHaveLength(3);

      // Validation & authorization checks
      await expectAppError(
        () =>
          depositToSavingsGoal(db, user.user.id, linkedGoal.id, {
            amount: 0,
            mode: "virtual",
          }),
        400
      );
      await expectAppError(
        () =>
          depositToSavingsGoal(db, user.user.id, linkedGoal.id, {
            amount: 100_000,
            mode: "wallet_transfer",
          }),
        400
      );
      await expectAppError(
        () =>
          depositToSavingsGoal(db, user.user.id, linkedGoal.id, {
            amount: 100_000,
            mode: "wallet_transfer",
            sourceWalletId: partnerViewerWallet.id,
          }),
        403
      );
      await expectAppError(
        () =>
          depositToSavingsGoal(db, partner.user.id, linkedGoal.id, {
            amount: 100_000,
            mode: "virtual",
          }),
        403
      );
      // Balances unchanged on rejected deposits
      expect(getWalletBalance(db, checkingWallet.id)).toBe(7_000_000);
      expect(getWalletBalance(db, savingsWallet.id)).toBe(3_500_000);

      // Atomic rollback: goal linked to shared editor wallet, then access is revoked before deposit -> 403 & zero drift
      const sharedSavings = createWallet(db, partner.user.id, {
        name: "Tabungan Bersama Nadia",
        type: "savings",
        initialBalance: 1_000_000,
      });
      const edInv = createWalletInvite(db, sharedSavings.id, partner.user.id, {
        email: user.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, edInv.token, user.user);

      const sharedGoal = createSavingsGoal(db, user.user.id, {
        name: "Liburan Bersama",
        targetAmount: 5_000_000,
        walletId: sharedSavings.id,
      });
      removeWalletMember(db, sharedSavings.id, partner.user.id, user.user.id);

      await expectAppError(
        () =>
          depositToSavingsGoal(db, user.user.id, sharedGoal.id, {
            amount: 250_000,
            mode: "wallet_transfer",
            sourceWalletId: checkingWallet.id,
          }),
        403
      );
      expect(getWalletBalance(db, checkingWallet.id)).toBe(7_000_000);
      expect(getWalletBalance(db, sharedSavings.id)).toBe(1_000_000);
      expect(
        listSavingsGoals(db, user.user.id).find((g) => g.id === sharedGoal.id)!
          .currentAmount
      ).toBe(0);
      deleteSavingsGoal(db, user.user.id, sharedGoal.id);

      // Update & delete goal
      const patched = updateSavingsGoal(db, user.user.id, linkedGoal.id, {
        targetAmount: 3_000_000,
        notes: null,
      });
      expect(patched.remainingAmount).toBe(0);
      expect(patched.notes).toBeNull();

      await expectAppError(
        () => deleteSavingsGoal(db, partner.user.id, linkedGoal.id),
        403
      );
      deleteSavingsGoal(db, user.user.id, unlinkedGoal.id);
      expect(listSavingsGoals(db, user.user.id)).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("API route handlers enforce 401, 400 malformed JSON, Indonesian Zod errors (no English leakage), and full HTTP lifecycle", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-plan-api-"));
    process.env.DATABASE_PATH = path.join(tempDir, "test.db");
    mockSessionCookie = undefined;

    function jsonReq(url: string, method: string, body: unknown): Request {
      return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    function badJsonReq(url: string, method: string): Request {
      return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: "{bad-json",
      });
    }

    try {
      const db = getDb();
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka-plan-api@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia-plan-api@aruskas.test",
        password: "Password123!",
      });

      // 1. Unauthenticated -> 401 across all 8 route files / 13 handlers
      expect(
        (
          await listCategoriesRoute(
            new Request("http://localhost/api/categories")
          )
        ).status
      ).toBe(401);
      expect(
        (
          await createCategoryRoute(
            jsonReq("http://localhost/api/categories", "POST", {})
          )
        ).status
      ).toBe(401);
      expect(
        (
          await updateCategoryRoute(
            jsonReq("http://localhost/api/categories/c1", "PATCH", {}),
            { params: Promise.resolve({ id: "c1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await deleteCategoryRoute(
            new Request("http://localhost/api/categories/c1", {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: "c1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (await listBudgetsRoute(new Request("http://localhost/api/budgets")))
          .status
      ).toBe(401);
      expect(
        (
          await upsertBudgetRoute(
            jsonReq("http://localhost/api/budgets", "POST", {})
          )
        ).status
      ).toBe(401);
      expect(
        (
          await deleteBudgetRoute(
            new Request("http://localhost/api/budgets/b1", {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: "b1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await copyBudgetsRoute(
            jsonReq("http://localhost/api/budgets/copy", "POST", {})
          )
        ).status
      ).toBe(401);
      expect((await listGoalsRoute()).status).toBe(401);
      expect(
        (
          await createGoalRoute(
            jsonReq("http://localhost/api/goals", "POST", {})
          )
        ).status
      ).toBe(401);
      expect(
        (
          await updateGoalRoute(
            jsonReq("http://localhost/api/goals/g1", "PATCH", {}),
            { params: Promise.resolve({ id: "g1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await deleteGoalRoute(
            new Request("http://localhost/api/goals/g1", { method: "DELETE" }),
            { params: Promise.resolve({ id: "g1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await depositGoalRoute(
            jsonReq("http://localhost/api/goals/g1/deposit", "POST", {}),
            { params: Promise.resolve({ id: "g1" }) }
          )
        ).status
      ).toBe(401);

      // Authenticate as owner
      mockSessionCookie = owner.token;

      const wallet = createWallet(db, owner.user.id, {
        name: "BCA Uji",
        type: "bank",
        initialBalance: 5_000_000,
      });
      const savings = createWallet(db, owner.user.id, {
        name: "Tabungan Uji",
        type: "savings",
        initialBalance: 1_000_000,
      });
      const sharedInvite = createWalletInvite(db, wallet.id, owner.user.id, {
        email: partner.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, sharedInvite.token, partner.user);

      // 2. Malformed & non-object JSON -> 400
      expect(
        (
          await createCategoryRoute(
            badJsonReq("http://localhost/api/categories", "POST")
          )
        ).status
      ).toBe(400);
      expect(
        (
          await upsertBudgetRoute(
            badJsonReq("http://localhost/api/budgets", "POST")
          )
        ).status
      ).toBe(400);
      expect(
        (
          await createGoalRoute(
            jsonReq("http://localhost/api/goals", "POST", [])
          )
        ).status
      ).toBe(400);

      // 3. Indonesian Zod errors (zero English error messages)
      const badCatTypeRes = await createCategoryRoute(
        jsonReq("http://localhost/api/categories", "POST", {
          name: "Uji",
          type: "transfer",
        })
      );
      expect(badCatTypeRes.status).toBe(400);
      expect(((await badCatTypeRes.json()) as { error: string }).error).toBe(
        "Tipe kategori harus pemasukan atau pengeluaran."
      );

      const missingCatTypeRes = await createCategoryRoute(
        jsonReq("http://localhost/api/categories", "POST", {
          name: "Uji",
        })
      );
      expect(missingCatTypeRes.status).toBe(400);
      expect(
        ((await missingCatTypeRes.json()) as { error: string }).error
      ).toBe("Tipe kategori wajib dipilih.");

      const badBudgetMonthRes = await upsertBudgetRoute(
        jsonReq("http://localhost/api/budgets", "POST", {
          categoryId: "c1",
          month: "2026-13",
          limitAmount: 100_000,
        })
      );
      expect(badBudgetMonthRes.status).toBe(400);
      expect(
        ((await badBudgetMonthRes.json()) as { error: string }).error
      ).toBe("Format bulan tidak valid (gunakan YYYY-MM).");

      const badGoalModeRes = await depositGoalRoute(
        jsonReq("http://localhost/api/goals/g1/deposit", "POST", {
          amount: 100_000,
          mode: "crypto",
        }),
        { params: Promise.resolve({ id: "g1" }) }
      );
      expect(badGoalModeRes.status).toBe(400);
      expect(((await badGoalModeRes.json()) as { error: string }).error).toBe(
        "Mode setoran harus wallet_transfer atau virtual."
      );

      // 4. Full Categories HTTP lifecycle
      const createCatRes = await createCategoryRoute(
        jsonReq("http://localhost/api/categories", "POST", {
          name: "Kopi & Camilan",
          type: "expense",
          icon: "Coffee",
          color: "#f97316",
        })
      );
      expect(createCatRes.status).toBe(201);
      const createdCat = (
        (await createCatRes.json()) as { category: { id: string } }
      ).category;

      const patchCatRes = await updateCategoryRoute(
        jsonReq(`http://localhost/api/categories/${createdCat.id}`, "PATCH", {
          name: "Kopi Spesialti",
        }),
        { params: Promise.resolve({ id: createdCat.id }) }
      );
      expect(patchCatRes.status).toBe(200);

      // Partner can list owner's categories via ?ownerId=
      mockSessionCookie = partner.token;
      const partnerCatsRes = await listCategoriesRoute(
        new Request(
          `http://localhost/api/categories?type=expense&ownerId=${owner.user.id}`
        )
      );
      expect(partnerCatsRes.status).toBe(200);
      const partnerCatsJson = (await partnerCatsRes.json()) as {
        categories: Array<{ id: string }>;
      };
      expect(partnerCatsJson.categories.some((c) => c.id === createdCat.id)).toBe(
        true
      );

      // 5. Full Budgets HTTP lifecycle
      mockSessionCookie = owner.token;
      const upsertBudgetRes = await upsertBudgetRoute(
        jsonReq("http://localhost/api/budgets", "POST", {
          categoryId: createdCat.id,
          month: "2026-10",
          limitAmount: 300_000,
        })
      );
      expect(upsertBudgetRes.status).toBe(200);
      const budgetOctId = (
        (await upsertBudgetRes.json()) as { budget: { id: string } }
      ).budget.id;

      // Deleting category referenced by budget returns 409
      const delCatBlockedRes = await deleteCategoryRoute(
        new Request(`http://localhost/api/categories/${createdCat.id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: createdCat.id }) }
      );
      expect(delCatBlockedRes.status).toBe(409);

      const copyRes = await copyBudgetsRoute(
        jsonReq("http://localhost/api/budgets/copy", "POST", {
          month: "2026-11",
        })
      );
      expect(copyRes.status).toBe(200);
      expect(await copyRes.json()).toEqual({ copiedCount: 1 });

      const listBudgetsRes = await listBudgetsRoute(
        new Request("http://localhost/api/budgets?month=2026-11")
      );
      expect(listBudgetsRes.status).toBe(200);
      const budgetsJson = (await listBudgetsRes.json()) as {
        budgets: Array<{ id: string; categoryId: string }>;
      };
      expect(budgetsJson.budgets).toHaveLength(1);
      const budgetNovId = budgetsJson.budgets[0].id;

      // Delete both budgets, then category deletion succeeds (200)
      expect(
        (
          await deleteBudgetRoute(
            new Request(`http://localhost/api/budgets/${budgetOctId}`, {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: budgetOctId }) }
          )
        ).status
      ).toBe(200);
      expect(
        (
          await deleteBudgetRoute(
            new Request(`http://localhost/api/budgets/${budgetNovId}`, {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: budgetNovId }) }
          )
        ).status
      ).toBe(200);
      expect(
        (
          await deleteCategoryRoute(
            new Request(`http://localhost/api/categories/${createdCat.id}`, {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: createdCat.id }) }
          )
        ).status
      ).toBe(200);

      // 6. Full Savings Goals HTTP lifecycle
      const createGoalRes = await createGoalRoute(
        jsonReq("http://localhost/api/goals", "POST", {
          name: "Umroh Keluarga",
          targetAmount: 30_000_000,
          walletId: savings.id,
          deadline: "2028-01-15",
        })
      );
      expect(createGoalRes.status).toBe(201);
      const goalId = (
        (await createGoalRes.json()) as { goal: { id: string } }
      ).goal.id;

      const listGoalsRes = await listGoalsRoute();
      expect(listGoalsRes.status).toBe(200);
      expect(
        ((await listGoalsRes.json()) as { goals: unknown[] }).goals
      ).toHaveLength(1);

      const patchGoalRes = await updateGoalRoute(
        jsonReq(`http://localhost/api/goals/${goalId}`, "PATCH", {
          targetAmount: 35_000_000,
        }),
        { params: Promise.resolve({ id: goalId }) }
      );
      expect(patchGoalRes.status).toBe(200);

      const depositWalletRes = await depositGoalRoute(
        jsonReq(`http://localhost/api/goals/${goalId}/deposit`, "POST", {
          amount: 1_000_000,
          mode: "wallet_transfer",
          sourceWalletId: wallet.id,
          occurredAt: "2026-11-20",
        }),
        { params: Promise.resolve({ id: goalId }) }
      );
      expect(depositWalletRes.status).toBe(200);
      expect(getWalletBalance(db, wallet.id)).toBe(4_000_000);
      expect(getWalletBalance(db, savings.id)).toBe(2_000_000);

      const depositVirtualRes = await depositGoalRoute(
        jsonReq(`http://localhost/api/goals/${goalId}/deposit`, "POST", {
          amount: 250_000,
          mode: "virtual",
        }),
        { params: Promise.resolve({ id: goalId }) }
      );
      expect(depositVirtualRes.status).toBe(200);
      expect(
        ((await depositVirtualRes.json()) as { goal: { currentAmount: number } })
          .goal.currentAmount
      ).toBe(1_250_000);

      const delGoalRes = await deleteGoalRoute(
        new Request(`http://localhost/api/goals/${goalId}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: goalId }) }
      );
      expect(delGoalRes.status).toBe(200);

      // 7. Extra query/date validation edge checks
      const defaultMonthBudgetsRes = await listBudgetsRoute(
        new Request("http://localhost/api/budgets")
      );
      expect(defaultMonthBudgetsRes.status).toBe(200);

      const invalidMonthQueryRes = await listBudgetsRoute(
        new Request("http://localhost/api/budgets?month=2026-13")
      );
      expect(invalidMonthQueryRes.status).toBe(400);

      mockSessionCookie = owner.token;
      const forbiddenOwnerCatRes = await listCategoriesRoute(
        new Request(`http://localhost/api/categories?ownerId=${partner.user.id}`)
      );
      expect(forbiddenOwnerCatRes.status).toBe(403);

      const invalidDeadlineRes = await createGoalRoute(
        jsonReq("http://localhost/api/goals", "POST", {
          name: "Target Tanggal Salah",
          targetAmount: 1_000_000,
          deadline: "2026-02-30",
        })
      );
      expect(invalidDeadlineRes.status).toBe(400);
    } finally {
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
