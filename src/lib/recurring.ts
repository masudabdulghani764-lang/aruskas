import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { AppDb } from "@/db";
import { categories, recurringRules, transactions, wallets } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getTodayISO } from "@/lib/format";
import {
  assertPositiveIntAmount,
  assertValidIsoDate,
  insertTransactionInExecutor,
  type TransactionView,
} from "@/lib/transactions";
import { assertWalletAccess } from "@/lib/wallets";

export type RecurringFrequency = "weekly" | "monthly";
export type RecurringType = "income" | "expense";

export type RecurringRuleView = {
  id: string;
  userId: string;
  walletId: string;
  walletName: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  type: RecurringType;
  amount: number;
  title: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  isActive: boolean;
  isDue: boolean;
  createdAt: string;
};

export type CreateRecurringInput = {
  walletId: string;
  categoryId: string;
  type: RecurringType;
  amount: number;
  title: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
};

/**
 * Advances an ISO date (`YYYY-MM-DD`) by 1 weekly (+7 days) or monthly (+1 month,
 * clamping to the last day of the target month, e.g. Jan 31 -> Feb 28/29) cycle.
 */
export function advanceDate(
  isoDate: string,
  frequency: "weekly" | "monthly"
): string {
  const valid = assertValidIsoDate(isoDate);
  const [yearStr, monthStr, dayStr] = valid.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (frequency === "weekly") {
    const next = new Date(Date.UTC(year, month - 1, day + 7));
    const y = next.getUTCFullYear();
    const m = String(next.getUTCMonth() + 1).padStart(2, "0");
    const d = String(next.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Monthly: month is 1..12, so JS month index `month` is already next month.
  const nextMonthZeroBased = month;
  const targetYear = year + Math.floor(nextMonthZeroBased / 12);
  const targetMonth = (nextMonthZeroBased % 12) + 1;
  const maxDayInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth, 0)
  ).getUTCDate();
  const clampedDay = Math.min(day, maxDayInTargetMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(
    clampedDay
  ).padStart(2, "0")}`;
}

function buildRecurringRuleViews(
  db: AppDb,
  rows: Array<typeof recurringRules.$inferSelect>,
  todayIso: string
): RecurringRuleView[] {
  if (rows.length === 0) {
    return [];
  }

  const walletIds = Array.from(new Set(rows.map((r) => r.walletId)));
  const categoryIds = Array.from(new Set(rows.map((r) => r.categoryId)));

  const walletRows = db
    .select({ id: wallets.id, name: wallets.name })
    .from(wallets)
    .where(inArray(wallets.id, walletIds))
    .all();
  const walletMap = new Map(walletRows.map((w) => [w.id, w.name]));

  const categoryRows = db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
    })
    .from(categories)
    .where(inArray(categories.id, categoryIds))
    .all();
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));

  return rows.map((row) => {
    const cat = categoryMap.get(row.categoryId);
    return {
      id: row.id,
      userId: row.userId,
      walletId: row.walletId,
      walletName: walletMap.get(row.walletId) ?? "Dompet",
      categoryId: row.categoryId,
      categoryName: cat?.name ?? "Kategori",
      categoryColor: cat?.color ?? "#64748b",
      categoryIcon: cat?.icon ?? "Circle",
      type: row.type,
      amount: row.amount,
      title: row.title,
      frequency: row.frequency,
      nextRunDate: row.nextRunDate,
      isActive: row.isActive,
      isDue: row.isActive && row.nextRunDate <= todayIso,
      createdAt: row.createdAt,
    };
  });
}

function validateRecurringFields(
  db: AppDb,
  userId: string,
  input: CreateRecurringInput
): CreateRecurringInput {
  const amount = assertPositiveIntAmount(input.amount);
  const title = input.title.trim();
  if (!title) {
    throw new AppError(400, "Judul jadwal rutin wajib diisi.");
  }
  const nextRunDate = assertValidIsoDate(input.nextRunDate);

  if (input.type !== "income" && input.type !== "expense") {
    throw new AppError(400, "Tipe jadwal rutin harus pemasukan atau pengeluaran.");
  }
  if (input.frequency !== "weekly" && input.frequency !== "monthly") {
    throw new AppError(400, "Frekuensi jadwal harus mingguan atau bulanan.");
  }

  const { wallet } = assertWalletAccess(db, input.walletId, userId, "owner");

  const category = db
    .select({
      id: categories.id,
      userId: categories.userId,
      type: categories.type,
    })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .get();

  if (
    !category ||
    category.userId !== wallet.ownerId ||
    category.type !== input.type
  ) {
    throw new AppError(400, "Kategori tidak valid untuk dompet ini.");
  }

  return {
    walletId: input.walletId,
    categoryId: category.id,
    type: input.type,
    amount,
    title,
    frequency: input.frequency,
    nextRunDate,
  };
}

function loadOwnedRule(
  db: AppDb,
  ruleId: string,
  userId: string
): typeof recurringRules.$inferSelect {
  const rule = db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.id, ruleId))
    .get();

  if (!rule) {
    throw new AppError(404, "Jadwal transaksi rutin tidak ditemukan.");
  }

  if (rule.userId !== userId) {
    throw new AppError(403, "Anda tidak memiliki akses ke jadwal rutin ini.");
  }

  return rule;
}

/**
 * Lists all recurring rules owned by the user ordered by nextRunDate ascending.
 */
export function listRecurringRules(
  db: AppDb,
  userId: string
): RecurringRuleView[] {
  const rows = db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.userId, userId))
    .orderBy(asc(recurringRules.nextRunDate), asc(recurringRules.createdAt))
    .all();

  return buildRecurringRuleViews(db, rows, getTodayISO());
}

/**
 * Lists active recurring rules whose `nextRunDate <= todayIso`.
 */
export function listDueRecurringRules(
  db: AppDb,
  userId: string,
  todayIso?: string
): RecurringRuleView[] {
  const today = todayIso ? assertValidIsoDate(todayIso) : getTodayISO();
  const rows = db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.userId, userId),
        eq(recurringRules.isActive, true),
        lte(recurringRules.nextRunDate, today)
      )
    )
    .orderBy(asc(recurringRules.nextRunDate), asc(recurringRules.createdAt))
    .all();

  return buildRecurringRuleViews(db, rows, today);
}

/**
 * Creates a new recurring rule (owner-only on the target wallet).
 */
export function createRecurringRule(
  db: AppDb,
  userId: string,
  input: CreateRecurringInput
): RecurringRuleView {
  const resolved = validateRecurringFields(db, userId, input);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.insert(recurringRules)
    .values({
      id,
      userId,
      walletId: resolved.walletId,
      categoryId: resolved.categoryId,
      type: resolved.type,
      amount: resolved.amount,
      title: resolved.title,
      frequency: resolved.frequency,
      nextRunDate: resolved.nextRunDate,
      isActive: true,
      createdAt,
    })
    .run();

  const created = db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.id, id))
    .get()!;

  return buildRecurringRuleViews(db, [created], getTodayISO())[0];
}

/**
 * Updates a recurring rule owned by the user.
 */
export function updateRecurringRule(
  db: AppDb,
  ruleId: string,
  userId: string,
  input: Partial<CreateRecurringInput & { isActive: boolean }>
): RecurringRuleView {
  const existing = loadOwnedRule(db, ruleId, userId);

  const resolved = validateRecurringFields(db, userId, {
    walletId: input.walletId ?? existing.walletId,
    categoryId: input.categoryId ?? existing.categoryId,
    type: input.type ?? existing.type,
    amount: input.amount ?? existing.amount,
    title: input.title !== undefined ? input.title : existing.title,
    frequency: input.frequency ?? existing.frequency,
    nextRunDate: input.nextRunDate ?? existing.nextRunDate,
  });

  const isActive = input.isActive ?? existing.isActive;

  db.update(recurringRules)
    .set({
      walletId: resolved.walletId,
      categoryId: resolved.categoryId,
      type: resolved.type,
      amount: resolved.amount,
      title: resolved.title,
      frequency: resolved.frequency,
      nextRunDate: resolved.nextRunDate,
      isActive,
    })
    .where(eq(recurringRules.id, ruleId))
    .run();

  const updated = db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.id, ruleId))
    .get()!;

  return buildRecurringRuleViews(db, [updated], getTodayISO())[0];
}

/**
 * Deletes a recurring rule while detaching any historical transactions generated by it.
 */
export function deleteRecurringRule(
  db: AppDb,
  ruleId: string,
  userId: string
): void {
  loadOwnedRule(db, ruleId, userId);

  db.transaction((tx) => {
    tx.update(transactions)
      .set({ recurringRuleId: null })
      .where(eq(transactions.recurringRuleId, ruleId))
      .run();

    tx.delete(recurringRules).where(eq(recurringRules.id, ruleId)).run();
  });
}

/**
 * Atomically posts a transaction for `rule.nextRunDate` (with optional amount override),
 * updates wallet balance, and advances `rule.nextRunDate` by 1 cycle.
 */
export function applyRecurringRule(
  db: AppDb,
  ruleId: string,
  userId: string,
  overrideAmount?: number
): TransactionView {
  if (overrideAmount !== undefined) {
    assertPositiveIntAmount(overrideAmount);
  }

  return db.transaction((tx) => {
    const freshRule = tx
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.id, ruleId))
      .get();

    if (!freshRule) {
      throw new AppError(404, "Jadwal transaksi rutin tidak ditemukan.");
    }
    if (freshRule.userId !== userId) {
      throw new AppError(403, "Anda tidak memiliki akses ke jadwal rutin ini.");
    }
    if (!freshRule.isActive) {
      throw new AppError(400, "Jadwal rutin sedang nonaktif.");
    }

    const amount = overrideAmount ?? freshRule.amount;
    const nextRunDate = advanceDate(freshRule.nextRunDate, freshRule.frequency);

    const view = insertTransactionInExecutor(tx, userId, {
      walletId: freshRule.walletId,
      categoryId: freshRule.categoryId,
      type: freshRule.type,
      amount,
      title: freshRule.title,
      occurredAt: freshRule.nextRunDate,
      recurringRuleId: freshRule.id,
    });

    tx.update(recurringRules)
      .set({ nextRunDate })
      .where(eq(recurringRules.id, freshRule.id))
      .run();

    return view;
  });
}

/**
 * Advances `nextRunDate` by 1 cycle without inserting any transaction or changing wallet balance.
 */
export function skipRecurringRule(
  db: AppDb,
  ruleId: string,
  userId: string
): RecurringRuleView {
  const existing = loadOwnedRule(db, ruleId, userId);
  assertWalletAccess(db, existing.walletId, userId, "owner");

  const nextRunDate = advanceDate(existing.nextRunDate, existing.frequency);

  db.update(recurringRules)
    .set({ nextRunDate })
    .where(eq(recurringRules.id, ruleId))
    .run();

  const updated = db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.id, ruleId))
    .get()!;

  return buildRecurringRuleViews(db, [updated], getTodayISO())[0];
}
