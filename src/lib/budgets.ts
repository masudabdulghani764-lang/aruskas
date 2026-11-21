import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import type { AppDb } from "@/db";
import { budgets, categories, transactions, wallets } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getPreviousMonthYM } from "@/lib/format";
import { assertPositiveIntAmount } from "@/lib/transactions";

export type BudgetStatus = "safe" | "warning" | "exceeded";

export type BudgetProgressView = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  month: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percentage: number;
  status: BudgetStatus;
};

type BudgetRowWithCategory = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  month: string;
  limitAmount: number;
};

/**
 * Validates strict `YYYY-MM` calendar month format.
 */
export function assertValidMonthYM(month: string): string {
  const trimmed = month.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    throw new AppError(400, "Format bulan tidak valid (gunakan YYYY-MM).");
  }
  return trimmed;
}

function computeBudgetStatus(
  spentAmount: number,
  limitAmount: number
): BudgetStatus {
  // Compare exact integers before rounding percentage so 79.9% stays "safe"
  // and 100.01% stays "exceeded".
  if (spentAmount > limitAmount) {
    return "exceeded";
  }
  if (spentAmount * 100 >= limitAmount * 80) {
    return "warning";
  }
  return "safe";
}

async function buildBudgetProgressViews(
  db: AppDb,
  userId: string,
  month: string,
  rows: BudgetRowWithCategory[]
): Promise<BudgetProgressView[]> {
  if (rows.length === 0) {
    return [];
  }

  const categoryIds = Array.from(new Set(rows.map((r) => r.categoryId)));
  const spentRows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .where(
      and(
        eq(wallets.ownerId, userId),
        eq(transactions.type, "expense"),
        like(transactions.occurredAt, `${month}-%`),
        inArray(transactions.categoryId, categoryIds)
      )
    )
    .groupBy(transactions.categoryId);

  const spentMap = new Map<string, number>();
  for (const item of spentRows) {
    if (item.categoryId) {
      spentMap.set(item.categoryId, Number(item.total));
    }
  }

  return rows.map((row) => {
    const spentAmount = spentMap.get(row.categoryId) ?? 0;
    const remainingAmount = row.limitAmount - spentAmount;
    const percentage =
      Math.round((spentAmount / row.limitAmount) * 1000) / 10;

    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      categoryIcon: row.categoryIcon,
      month: row.month,
      limitAmount: row.limitAmount,
      spentAmount,
      remainingAmount,
      percentage,
      status: computeBudgetStatus(spentAmount, row.limitAmount),
    };
  });
}

/**
 * Lists monthly budgets for `userId` with exact expense realization across owned
 * wallets only (excluding transfers and wallets owned by other users).
 */
export async function listMonthlyBudgets(
  db: AppDb,
  userId: string,
  month: string
): Promise<BudgetProgressView[]> {
  const validMonth = assertValidMonthYM(month);

  const rows = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      month: budgets.month,
      limitAmount: budgets.limitAmount,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.userId, userId), eq(budgets.month, validMonth)))
    .orderBy(asc(categories.name), asc(budgets.createdAt));

  return buildBudgetProgressViews(db, userId, validMonth, rows);
}

/**
 * Inserts or updates a monthly expense budget on `(userId, categoryId, month)`.
 */
export async function upsertBudget(
  db: AppDb,
  userId: string,
  input: { categoryId: string; month: string; limitAmount: number }
): Promise<BudgetProgressView> {
  const validMonth = assertValidMonthYM(input.month);
  const limitAmount = assertPositiveIntAmount(input.limitAmount);

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);

  if (!category) {
    throw new AppError(404, "Kategori tidak ditemukan.");
  }
  if (category.userId !== userId) {
    throw new AppError(403, "Anda tidak memiliki akses ke kategori ini.");
  }
  if (category.type !== "expense") {
    throw new AppError(
      400,
      "Anggaran hanya dapat dibuat untuk kategori pengeluaran."
    );
  }

  const now = new Date().toISOString();
  const [saved] = await db
    .insert(budgets)
    .values({
      id: crypto.randomUUID(),
      userId,
      categoryId: category.id,
      month: validMonth,
      limitAmount,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.month],
      set: { limitAmount },
    })
    .returning({ id: budgets.id });

  const views = await buildBudgetProgressViews(db, userId, validMonth, [
    {
      id: saved!.id,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
      month: validMonth,
      limitAmount,
    },
  ]);
  return views[0];
}

/**
 * Deletes an existing budget owned by `userId`.
 */
export async function deleteBudget(
  db: AppDb,
  userId: string,
  budgetId: string
): Promise<void> {
  const [existing] = await db
    .select({ id: budgets.id, userId: budgets.userId })
    .from(budgets)
    .where(eq(budgets.id, budgetId))
    .limit(1);

  if (!existing) {
    throw new AppError(404, "Anggaran tidak ditemukan.");
  }
  if (existing.userId !== userId) {
    throw new AppError(403, "Anda tidak memiliki akses ke anggaran ini.");
  }

  await db.delete(budgets).where(eq(budgets.id, budgetId));
}

/**
 * Idempotently copies missing budgets from the previous calendar month into `targetMonth`.
 */
export async function copyBudgetsFromPreviousMonth(
  db: AppDb,
  userId: string,
  targetMonth: string
): Promise<{ copiedCount: number }> {
  const validTargetMonth = assertValidMonthYM(targetMonth);
  const previousMonth = getPreviousMonthYM(validTargetMonth);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const prevBudgets = await tx
      .select({
        categoryId: budgets.categoryId,
        limitAmount: budgets.limitAmount,
      })
      .from(budgets)
      .where(
        and(eq(budgets.userId, userId), eq(budgets.month, previousMonth))
      );

    if (prevBudgets.length === 0) {
      return { copiedCount: 0 };
    }

    const existingRows = await tx
      .select({ categoryId: budgets.categoryId })
      .from(budgets)
      .where(
        and(eq(budgets.userId, userId), eq(budgets.month, validTargetMonth))
      );

    const existingCategoryIds = new Set(existingRows.map((r) => r.categoryId));
    const missing = prevBudgets.filter(
      (b) => !existingCategoryIds.has(b.categoryId)
    );

    if (missing.length === 0) {
      return { copiedCount: 0 };
    }

    await tx
      .insert(budgets)
      .values(
        missing.map((item) => ({
          id: crypto.randomUUID(),
          userId,
          categoryId: item.categoryId,
          month: validTargetMonth,
          limitAmount: item.limitAmount,
          createdAt: now,
        }))
      )
      .onConflictDoNothing({
        target: [budgets.userId, budgets.categoryId, budgets.month],
      });

    return { copiedCount: missing.length };
  });
}
