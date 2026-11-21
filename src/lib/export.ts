import { desc, eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { budgets } from "@/db/schema";
import type { SafeUser } from "@/lib/auth";
import { listMonthlyBudgets, type BudgetProgressView } from "@/lib/budgets";
import { listCategories } from "@/lib/categories";
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
