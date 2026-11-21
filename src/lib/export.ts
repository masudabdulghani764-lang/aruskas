import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db";
import {
  budgets,
  categories,
  recurringRules,
  savingsGoals,
  transactions,
  walletMembers,
  wallets,
} from "@/db/schema";
import type { SafeUser } from "@/lib/auth";
import { listMonthlyBudgets, type BudgetProgressView } from "@/lib/budgets";
import { listCategories } from "@/lib/categories";
import { AppError } from "@/lib/errors";
import { escapeCsvCell } from "@/lib/format";
import { listSavingsGoals, type SavingsGoalView } from "@/lib/goals";
import { listRecurringRules, type RecurringRuleView } from "@/lib/recurring";
import {
  listTransactions,
  type TransactionType,
  type TransactionView,
} from "@/lib/transactions";
import { listUserWallets, type WalletWithRole } from "@/lib/wallets";

const CSV_HEADERS = [
  "Tanggal",
  "Judul",
  "Tipe",
  "Nominal (IDR)",
  "Dompet Asal",
  "Dompet Tujuan",
  "Kategori",
  "Pencatat",
  "Metode Pembayaran",
  "Catatan",
] as const;

const TYPE_LABEL_ID: Record<TransactionType, string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  transfer: "Transfer",
};

/**
 * Serializes transaction views into an Excel-safe UTF-8 BOM CSV string with
 * Indonesian headers and spreadsheet formula-injection neutralization.
 */
export function buildTransactionsCsv(rows: TransactionView[]): string {
  const headerLine = CSV_HEADERS.map((cell) => escapeCsvCell(cell)).join(",");
  const dataLines = rows.map((row) =>
    [
      row.occurredAt,
      row.title,
      TYPE_LABEL_ID[row.type],
      row.amount,
      row.walletName,
      row.targetWalletName ?? "",
      row.categoryName ?? "",
      row.recorderName,
      row.paymentMethod ?? "",
      row.notes ?? "",
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(",")
  );

  return `\uFEFF${[headerLine, ...dataLines].join("\n")}`;
}

/**
 * Builds a complete, credential-free JSON backup snapshot for the authenticated user.
 */
export async function buildUserBackupJson(
  db: AppDb,
  user: SafeUser
): Promise<{
  exportedAt: string;
  user: SafeUser;
  wallets: WalletWithRole[];
  categories: unknown[];
  transactions: TransactionView[];
  budgets: BudgetProgressView[];
  savingsGoals: SavingsGoalView[];
  recurringRules: RecurringRuleView[];
}> {
  const [
    userWallets,
    userCategories,
    txResult,
    budgetMonthRows,
    userGoals,
    userRecurring,
  ] = await Promise.all([
    listUserWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id),
    listTransactions(db, user.id, {}),
    db
      .selectDistinct({ month: budgets.month })
      .from(budgets)
      .where(eq(budgets.userId, user.id))
      .orderBy(desc(budgets.month)),
    listSavingsGoals(db, user.id),
    listRecurringRules(db, user.id),
  ]);

  const budgetGroups = await Promise.all(
    budgetMonthRows.map((row) => listMonthlyBudgets(db, user.id, row.month))
  );
  const userBudgets = budgetGroups.flat();

  return {
    exportedAt: new Date().toISOString(),
    user,
    wallets: userWallets,
    categories: userCategories,
    transactions: txResult.items,
    budgets: userBudgets,
    savingsGoals: userGoals,
    recurringRules: userRecurring,
  };
}

const backupRestoreSchema = z.object({
  wallets: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(100),
        type: z.enum(["cash", "bank", "ewallet", "savings"]),
        initialBalance: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        archivedAt: z.string().nullable().optional(),
      })
    )
    .max(200)
    .default([]),
  categories: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(60),
        type: z.enum(["income", "expense"]),
        icon: z.string().trim().min(1).max(40).default("Tag"),
        color: z.string().trim().min(4).max(20).default("#14532D"),
        isDefault: z.boolean().optional(),
      })
    )
    .max(300)
    .default([]),
  transactions: z
    .array(
      z.object({
        walletId: z.string().min(1),
        targetWalletId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        type: z.enum(["income", "expense", "transfer"]),
        amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        title: z.string().trim().min(1).max(150),
        notes: z.string().max(1000).nullable().optional(),
        paymentMethod: z.string().max(80).nullable().optional(),
        occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .max(10_000)
    .default([]),
  budgets: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        limitAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      })
    )
    .max(1_000)
    .default([]),
  savingsGoals: z
    .array(
      z.object({
        walletId: z.string().nullable().optional(),
        name: z.string().trim().min(1).max(100),
        targetAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        currentAmount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        deadline: z.string().nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
    )
    .max(200)
    .default([]),
  recurringRules: z
    .array(
      z.object({
        walletId: z.string().min(1),
        categoryId: z.string().nullable().optional(),
        type: z.enum(["income", "expense"]),
        amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        title: z.string().trim().min(1).max(150),
        frequency: z.enum(["weekly", "monthly"]),
        nextRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isActive: z.boolean().optional(),
      })
    )
    .max(200)
    .default([]),
});

export type BackupRestoreSummary = {
  walletsImported: number;
  categoriesImported: number;
  transactionsImported: number;
  budgetsImported: number;
  goalsImported: number;
  recurringImported: number;
};

/**
 * Safely imports a validated ArusKas JSON backup into the authenticated user's
 * account inside a single atomic transaction, remapping IDs and reconciling exact
 * balances without mutating other users' data.
 */
export async function restoreUserBackupJson(
  db: AppDb,
  userId: string,
  rawPayload: unknown
): Promise<BackupRestoreSummary> {
  const parsed = backupRestoreSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new AppError(
      400,
      "Format berkas backup JSON ArusKas tidak valid atau rusak."
    );
  }

  const data = parsed.data;
  const now = new Date().toISOString();

  return await db.transaction(async (tx) => {
    const existingCats = await tx
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));

    const catKeyMap = new Map<string, string>();
    for (const c of existingCats) {
      catKeyMap.set(`${c.type}:${c.name.trim().toLowerCase()}`, c.id);
    }

    const catIdMap = new Map<string, { id: string; type: "income" | "expense" }>();
    let categoriesImported = 0;

    for (const cat of data.categories) {
      const key = `${cat.type}:${cat.name.trim().toLowerCase()}`;
      const existingId = catKeyMap.get(key);
      if (existingId) {
        catIdMap.set(cat.id, { id: existingId, type: cat.type });
      } else {
        const newId = crypto.randomUUID();
        await tx.insert(categories).values({
          id: newId,
          userId,
          name: cat.name,
          type: cat.type,
          icon: cat.icon,
          color: cat.color,
          isDefault: false,
          createdAt: now,
        });
        catKeyMap.set(key, newId);
        catIdMap.set(cat.id, { id: newId, type: cat.type });
        categoriesImported += 1;
      }
    }

    const walletIdMap = new Map<string, string>();
    const walletBalances = new Map<string, number>();
    let walletsImported = 0;

    for (const w of data.wallets) {
      const newWalletId = crypto.randomUUID();
      await tx.insert(wallets).values({
        id: newWalletId,
        ownerId: userId,
        name: w.name,
        type: w.type,
        initialBalance: w.initialBalance,
        balance: w.initialBalance,
        isShared: false,
        archivedAt: w.archivedAt ?? null,
        createdAt: now,
      });
      await tx.insert(walletMembers).values({
        id: crypto.randomUUID(),
        walletId: newWalletId,
        userId,
        role: "owner",
        createdAt: now,
      });
      walletIdMap.set(w.id, newWalletId);
      walletBalances.set(newWalletId, w.initialBalance);
      walletsImported += 1;
    }

    let transactionsImported = 0;
    for (const item of data.transactions) {
      const mappedWalletId = walletIdMap.get(item.walletId);
      if (!mappedWalletId) {
        continue;
      }

      let mappedTargetWalletId: string | null = null;
      let mappedCategoryId: string | null = null;

      if (item.type === "transfer") {
        if (!item.targetWalletId) {
          continue;
        }
        const targetId = walletIdMap.get(item.targetWalletId);
        if (!targetId || targetId === mappedWalletId) {
          continue;
        }
        mappedTargetWalletId = targetId;
        walletBalances.set(
          mappedWalletId,
          (walletBalances.get(mappedWalletId) ?? 0) - item.amount
        );
        walletBalances.set(
          targetId,
          (walletBalances.get(targetId) ?? 0) + item.amount
        );
      } else {
        const mappedCat = item.categoryId ? catIdMap.get(item.categoryId) : null;
        if (mappedCat && mappedCat.type === item.type) {
          mappedCategoryId = mappedCat.id;
        }
        const delta = item.type === "income" ? item.amount : -item.amount;
        walletBalances.set(
          mappedWalletId,
          (walletBalances.get(mappedWalletId) ?? 0) + delta
        );
      }

      await tx.insert(transactions).values({
        id: crypto.randomUUID(),
        walletId: mappedWalletId,
        targetWalletId: mappedTargetWalletId,
        categoryId: mappedCategoryId,
        userId,
        type: item.type,
        amount: item.amount,
        title: item.title,
        notes: item.notes ?? null,
        paymentMethod: item.paymentMethod ?? null,
        occurredAt: item.occurredAt,
        createdAt: now,
        updatedAt: now,
      });
      transactionsImported += 1;
    }

    // Reconcile exact final wallet balances atomically
    for (const [walletId, finalBalance] of walletBalances.entries()) {
      await tx
        .update(wallets)
        .set({ balance: finalBalance })
        .where(eq(wallets.id, walletId));
    }

    let budgetsImported = 0;
    for (const b of data.budgets) {
      const mappedCat = catIdMap.get(b.categoryId);
      if (!mappedCat || mappedCat.type !== "expense") {
        continue;
      }
      const inserted = await tx
        .insert(budgets)
        .values({
          id: crypto.randomUUID(),
          userId,
          categoryId: mappedCat.id,
          month: b.month,
          limitAmount: b.limitAmount,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: budgets.id });
      if (inserted.length > 0) {
        budgetsImported += 1;
      }
    }

    let goalsImported = 0;
    for (const g of data.savingsGoals) {
      const mappedWalletId = g.walletId
        ? (walletIdMap.get(g.walletId) ?? null)
        : null;
      await tx.insert(savingsGoals).values({
        id: crypto.randomUUID(),
        userId,
        walletId: mappedWalletId,
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        deadline: g.deadline ?? null,
        notes: g.notes ?? null,
        createdAt: now,
      });
      goalsImported += 1;
    }

    let recurringImported = 0;
    const fallbackIncomeCat = existingCats.find((c) => c.type === "income")?.id;
    const fallbackExpenseCat = existingCats.find((c) => c.type === "expense")?.id;
    for (const r of data.recurringRules) {
      const mappedWalletId = walletIdMap.get(r.walletId);
      if (!mappedWalletId) {
        continue;
      }
      const mappedCat = r.categoryId ? catIdMap.get(r.categoryId) : null;
      const resolvedCategoryId =
        mappedCat && mappedCat.type === r.type
          ? mappedCat.id
          : r.type === "income"
            ? fallbackIncomeCat
            : fallbackExpenseCat;
      if (!resolvedCategoryId) {
        continue;
      }
      await tx.insert(recurringRules).values({
        id: crypto.randomUUID(),
        userId,
        walletId: mappedWalletId,
        categoryId: resolvedCategoryId,
        type: r.type,
        amount: r.amount,
        title: r.title,
        frequency: r.frequency,
        nextRunDate: r.nextRunDate,
        isActive: r.isActive ?? true,
        createdAt: now,
      });
      recurringImported += 1;
    }

    return {
      walletsImported,
      categoriesImported,
      transactionsImported,
      budgetsImported,
      goalsImported,
      recurringImported,
    };
  });
}
