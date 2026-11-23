import { and, inArray, lt, lte, gte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db";
import { transactions } from "@/db/schema";
import { listMonthlyBudgets, type BudgetProgressView } from "@/lib/budgets";
import { AppError } from "@/lib/errors";
import {
  formatDateID,
  formatMonthID,
  getPreviousMonthYM,
  getTodayISO,
} from "@/lib/format";
import {
  listDueRecurringRules,
  listRecurringRules,
  type RecurringRuleView,
} from "@/lib/recurring";
import {
  assertValidIsoDate,
  listTransactions,
  type TransactionView,
} from "@/lib/transactions";
import {
  assertWalletAccess,
  indonesianEnumErrorMap,
  listPendingInvitesForEmail,
  listUserWallets,
  type PendingInviteView,
  type WalletWithRole,
} from "@/lib/wallets";

export type ReportScope = "all" | "personal";

export type SafeToSpendSummary = {
  dailyAllowance: number;
  remainingBudget: number;
  totalReferenceLimit: number;
  spentThisMonth: number;
  remainingDays: number;
  basis: "budgets" | "income" | "balance";
  status: "safe" | "caution" | "over";
};

export type DashboardSummary = {
  scope: ReportScope;
  month: string;
  totalBalance: number;
  previousMonthNet: number;
  currentMonthIncome: number;
  currentMonthExpense: number;
  currentMonthNet: number;
  savingRate: number;
  balanceGrowthPct: number | null;
  safeToSpend: SafeToSpendSummary;
  activeWallets: WalletWithRole[];
  watchedWallets: WalletWithRole[];
  monthlySeries: Array<{
    month: string;
    label: string;
    income: number;
    expense: number;
    net: number;
  }>;
  topBudgets: BudgetProgressView[];
  recentTransactions: TransactionView[];
  dueRecurring: RecurringRuleView[];
  monthlyBills: {
    totalCount: number;
    dueCount: number;
    unpaidThisMonthCount: number;
    paidThisMonthCount: number;
    totalMonthlyAmount: number;
    remainingAmountThisMonth: number;
    bills: RecurringRuleView[];
  };
  pendingInvites: PendingInviteView[];
};

export type CategoryBreakdownItem = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  total: number;
  percentage: number;
  count: number;
};

export type FinancialReport = {
  from: string;
  to: string;
  scope: ReportScope;
  walletId: string | null;
  walletName: string | null;
  isSingleWallet: boolean;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  transferIn: number;
  transferOut: number;
  netChange: number;
  closingBalance: number;
  savingRate: number;
  transactionCount: number;
  trendSeries: Array<{
    period: string;
    label: string;
    income: number;
    expense: number;
    net: number;
  }>;
  incomeByCategory: CategoryBreakdownItem[];
  expenseByCategory: CategoryBreakdownItem[];
  transactions: TransactionView[];
};

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const dashboardQuerySchema = z.object({
  scope: z
    .enum(["all", "personal"], {
      errorMap: indonesianEnumErrorMap(
        "Cakupan dasbor wajib dipilih.",
        "Cakupan dasbor harus 'all' atau 'personal'."
      ),
    })
    .optional(),
});

const reportQuerySchema = z.object({
  from: z
    .string()
    .trim()
    .regex(
      isoDateRegex,
      "Format tanggal awal tidak valid (gunakan YYYY-MM-DD)."
    )
    .optional(),
  to: z
    .string()
    .trim()
    .regex(
      isoDateRegex,
      "Format tanggal akhir tidak valid (gunakan YYYY-MM-DD)."
    )
    .optional(),
  walletId: z.string().trim().min(1).optional(),
  scope: z
    .enum(["all", "personal"], {
      errorMap: indonesianEnumErrorMap(
        "Cakupan laporan wajib dipilih.",
        "Cakupan laporan harus 'all' atau 'personal'."
      ),
    })
    .optional(),
});

function optParam(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Parses and validates `?scope=all|personal` query params for the dashboard endpoint.
 */
export function parseDashboardScopeQuery(
  searchParams: URLSearchParams
): ReportScope {
  const parsed = dashboardQuerySchema.parse({
    scope: optParam(searchParams.get("scope")),
  });
  return parsed.scope ?? "all";
}

/**
 * Parses and validates `?from&to&walletId&scope` query params for report and CSV export endpoints.
 */
export function parseReportQueryParams(searchParams: URLSearchParams): {
  from: string;
  to: string;
  walletId?: string;
  scope: ReportScope;
} {
  const parsed = reportQuerySchema.parse({
    from: optParam(searchParams.get("from")),
    to: optParam(searchParams.get("to")),
    walletId: optParam(searchParams.get("walletId")),
    scope: optParam(searchParams.get("scope")),
  });

  const to = assertValidIsoDate(parsed.to ?? getTodayISO());
  const from = assertValidIsoDate(parsed.from ?? `${to.slice(0, 7)}-01`);

  if (from > to) {
    throw new AppError(400, "Tanggal awal tidak boleh melebihi tanggal akhir.");
  }

  return {
    from,
    to,
    walletId: parsed.walletId,
    scope: parsed.scope ?? "all",
  };
}

function validateScope(scope?: string): ReportScope {
  if (scope === undefined) {
    return "all";
  }
  if (scope !== "all" && scope !== "personal") {
    throw new AppError(400, "Cakupan laporan harus 'all' atau 'personal'.");
  }
  return scope;
}

function computeSavingRate(income: number, expense: number): number {
  if (income <= 0) {
    return 0;
  }
  return Math.round(((income - expense) / income) * 1000) / 10;
}

async function partitionUserWallets(
  db: AppDb,
  userId: string,
  scope: ReportScope
): Promise<{
  activeWallets: WalletWithRole[];
  watchedWallets: WalletWithRole[];
}> {
  const allWallets = await listUserWallets(db, userId);
  const watchedWallets = allWallets.filter((w) => w.role === "viewer");
  const editableWallets = allWallets.filter(
    (w) => w.role === "owner" || w.role === "editor"
  );
  const activeWallets =
    scope === "personal"
      ? editableWallets.filter((w) => w.ownerId === userId && !w.isShared)
      : editableWallets;

  return { activeWallets, watchedWallets };
}

function computeWalletSetMovement(
  rows: Array<{
    type: "income" | "expense" | "transfer";
    walletId: string;
    targetWalletId: string | null;
    amount: number;
  }>,
  selectedSet: Set<string>
): number {
  let movement = 0;
  for (const row of rows) {
    if (row.type === "income") {
      if (selectedSet.has(row.walletId)) {
        movement += row.amount;
      }
    } else if (row.type === "expense") {
      if (selectedSet.has(row.walletId)) {
        movement -= row.amount;
      }
    } else if (row.type === "transfer") {
      if (selectedSet.has(row.walletId)) {
        movement -= row.amount;
      }
      if (row.targetWalletId && selectedSet.has(row.targetWalletId)) {
        movement += row.amount;
      }
    }
  }
  return movement;
}

async function getPriorMovementForWalletSet(
  db: AppDb,
  walletIds: string[],
  _selectedSet: Set<string>,
  beforeDateIso: string
): Promise<number> {
  if (walletIds.length === 0) {
    return 0;
  }

  const [agg] = await db
    .select({
      inflow: sql<number>`coalesce(sum(case
        when ${transactions.type} = 'income' and ${inArray(transactions.walletId, walletIds)} then ${transactions.amount}
        when ${transactions.type} = 'transfer' and ${inArray(transactions.targetWalletId, walletIds)} then ${transactions.amount}
        else 0
      end), 0)`,
      outflow: sql<number>`coalesce(sum(case
        when ${transactions.type} = 'expense' and ${inArray(transactions.walletId, walletIds)} then ${transactions.amount}
        when ${transactions.type} = 'transfer' and ${inArray(transactions.walletId, walletIds)} then ${transactions.amount}
        else 0
      end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        lt(transactions.occurredAt, beforeDateIso),
        or(
          inArray(transactions.walletId, walletIds),
          inArray(transactions.targetWalletId, walletIds)
        )
      )
    );

  return Number(agg?.inflow ?? 0) - Number(agg?.outflow ?? 0);
}

function addOneUtcDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function addOneMonthYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function enumerateTrendPeriods(
  from: string,
  to: string,
  groupByMonth: boolean,
  fallbackPeriods: string[]
): string[] {
  if (!groupByMonth) {
    const days: string[] = [];
    let cursor = from;
    while (cursor <= to) {
      days.push(cursor);
      cursor = addOneUtcDay(cursor);
    }
    return days;
  }

  const fromYM = from.slice(0, 7);
  const toYM = to.slice(0, 7);
  const months: string[] = [];
  let cursor = fromYM;
  while (cursor <= toYM && months.length <= 240) {
    months.push(cursor);
    cursor = addOneMonthYM(cursor);
  }
  if (months.length > 240) {
    return Array.from(new Set(fallbackPeriods)).sort();
  }
  return months;
}

function buildCategoryBreakdown(
  items: TransactionView[],
  type: "income" | "expense",
  selectedSet: Set<string>,
  totalForType: number
): CategoryBreakdownItem[] {
  const buckets = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      total: number;
      count: number;
    }
  >();

  for (const tx of items) {
    if (tx.type !== type || !selectedSet.has(tx.walletId)) {
      continue;
    }
    const categoryId = tx.categoryId ?? "uncategorized";
    const existing = buckets.get(categoryId);
    if (existing) {
      existing.total += tx.amount;
      existing.count += 1;
    } else {
      buckets.set(categoryId, {
        categoryId,
        categoryName: tx.categoryName ?? "Tanpa Kategori",
        categoryColor: tx.categoryColor ?? "#64748b",
        total: tx.amount,
        count: 1,
      });
    }
  }

  return Array.from(buckets.values())
    .sort(
      (a, b) =>
        b.total - a.total || a.categoryName.localeCompare(b.categoryName, "id")
    )
    .map((item) => ({
      ...item,
      percentage:
        totalForType > 0
          ? Math.round((item.total / totalForType) * 1000) / 10
          : 0,
    }));
}

/**
 * Computes the complete dashboard aggregation for the authenticated user,
 * partitioning watched (viewer) wallets out of all cashflow & balance metrics.
 */
export async function getDashboardSummary(
  db: AppDb,
  userId: string,
  userEmail: string,
  opts?: { scope?: ReportScope; todayIso?: string }
): Promise<DashboardSummary> {
  const scope = validateScope(opts?.scope);
  const todayIso = opts?.todayIso
    ? assertValidIsoDate(opts.todayIso)
    : getTodayISO();
  const month = todayIso.slice(0, 7);

  const { activeWallets, watchedWallets } = await partitionUserWallets(
    db,
    userId,
    scope
  );
  const activeWalletIds = activeWallets.map((w) => w.id);
  const activeSet = new Set(activeWalletIds);
  const totalBalance = activeWallets.reduce((sum, w) => sum + w.balance, 0);

  const months: string[] = [];
  let cursor = month;
  for (let i = 0; i < 6; i += 1) {
    months.unshift(cursor);
    cursor = getPreviousMonthYM(cursor);
  }
  const oldestMonth = months[0];
  const monthStartIso = `${month}-01`;
  const monthEndIso = `${month}-31`;

  const [
    monthlyRows,
    priorMovement,
    currentMonthRows,
    monthlyBudgets,
    recentTxRes,
    dueRecurring,
    allRecurringRules,
    pendingInvites,
  ] = await Promise.all([
    activeWalletIds.length > 0
      ? db
          .select({
            month: sql<string>`substr(${transactions.occurredAt}, 1, 7)`,
            income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
            expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.walletId, activeWalletIds),
              inArray(transactions.type, ["income", "expense"]),
              gte(transactions.occurredAt, `${oldestMonth}-01`),
              lte(transactions.occurredAt, monthEndIso)
            )
          )
          .groupBy(sql`substr(${transactions.occurredAt}, 1, 7)`)
      : Promise.resolve([]),
    activeWalletIds.length > 0
      ? getPriorMovementForWalletSet(
          db,
          activeWalletIds,
          activeSet,
          monthStartIso
        )
      : Promise.resolve(0),
    activeWalletIds.length > 0
      ? db
          .select({
            type: transactions.type,
            walletId: transactions.walletId,
            targetWalletId: transactions.targetWalletId,
            amount: transactions.amount,
          })
          .from(transactions)
          .where(
            and(
              gte(transactions.occurredAt, monthStartIso),
              lte(transactions.occurredAt, monthEndIso),
              or(
                inArray(transactions.walletId, activeWalletIds),
                inArray(transactions.targetWalletId, activeWalletIds)
              )
            )
          )
      : Promise.resolve([]),
    listMonthlyBudgets(db, userId, month),
    activeWalletIds.length > 0
      ? listTransactions(db, userId, { limit: 16 })
      : Promise.resolve({
          items: [] as TransactionView[],
          summary: { income: 0, expense: 0, net: 0, count: 0 },
        }),
    listDueRecurringRules(db, userId, todayIso),
    listRecurringRules(db, userId),
    listPendingInvitesForEmail(db, userEmail),
  ]);

  const monthlyMap = new Map<string, { income: number; expense: number }>();
  for (const row of monthlyRows) {
    monthlyMap.set(row.month, {
      income: Number(row.income),
      expense: Number(row.expense),
    });
  }

  const monthlySeries = months.map((ym) => {
    const entry = monthlyMap.get(ym) ?? { income: 0, expense: 0 };
    return {
      month: ym,
      label: formatMonthID(ym),
      income: entry.income,
      expense: entry.expense,
      net: entry.income - entry.expense,
    };
  });

  const currentMonthEntry = monthlySeries[monthlySeries.length - 1];
  const previousMonthEntry = monthlySeries[monthlySeries.length - 2];

  const currentMonthIncome = currentMonthEntry.income;
  const currentMonthExpense = currentMonthEntry.expense;
  const currentMonthNet = currentMonthEntry.net;
  const previousMonthNet = previousMonthEntry.net;
  const savingRate = computeSavingRate(currentMonthIncome, currentMonthExpense);

  let balanceGrowthPct: number | null = null;
  if (activeWalletIds.length > 0) {
    const initialSum = activeWallets.reduce(
      (sum, w) => sum + w.initialBalance,
      0
    );
    const startOfMonthBalance = initialSum + priorMovement;

    if (startOfMonthBalance > 0) {
      const currentMonthMovement = computeWalletSetMovement(
        currentMonthRows,
        activeSet
      );
      const endOfMonthBalance = startOfMonthBalance + currentMonthMovement;
      balanceGrowthPct =
        Math.round(
          ((endOfMonthBalance - startOfMonthBalance) / startOfMonthBalance) *
            1000
        ) / 10;
    }
  }

  const topBudgets = monthlyBudgets
    .sort((a, b) => b.percentage - a.percentage || b.spentAmount - a.spentAmount)
    .slice(0, 5);

  const recentTransactions = recentTxRes.items
    .filter(
      (tx) =>
        activeSet.has(tx.walletId) ||
        (tx.targetWalletId !== null && activeSet.has(tx.targetWalletId))
    )
    .slice(0, 8);

  const [yearNum, monthNum, dayNum] = todayIso.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const remainingDays = Math.max(1, daysInMonth - dayNum + 1);

  let basis: SafeToSpendSummary["basis"] = "balance";
  let totalReferenceLimit = Math.max(0, totalBalance);
  let spentThisMonth = currentMonthExpense;
  let remainingBudget = Math.max(0, totalBalance);

  if (monthlyBudgets.length > 0) {
    basis = "budgets";
    totalReferenceLimit = monthlyBudgets.reduce(
      (sum, b) => sum + b.limitAmount,
      0
    );
    spentThisMonth = monthlyBudgets.reduce((sum, b) => sum + b.spentAmount, 0);
    remainingBudget = totalReferenceLimit - spentThisMonth;
  } else if (currentMonthIncome > 0) {
    basis = "income";
    totalReferenceLimit = currentMonthIncome;
    spentThisMonth = currentMonthExpense;
    remainingBudget = currentMonthIncome - currentMonthExpense;
  }

  const dailyAllowance =
    remainingBudget > 0 ? Math.floor(remainingBudget / remainingDays) : 0;
  const safeToSpendStatus: SafeToSpendSummary["status"] =
    remainingBudget <= 0
      ? "over"
      : totalReferenceLimit > 0 && remainingBudget / totalReferenceLimit <= 0.2
        ? "caution"
        : "safe";

  const safeToSpend: SafeToSpendSummary = {
    dailyAllowance,
    remainingBudget,
    totalReferenceLimit,
    spentThisMonth,
    remainingDays,
    basis,
    status: safeToSpendStatus,
  };

  const activeMonthlyBills = allRecurringRules.filter(
    (r) => r.isActive && r.type === "expense" && r.frequency === "monthly"
  );
  const unpaidMonthlyBills = activeMonthlyBills.filter(
    (r) => r.nextRunDate.slice(0, 7) <= month
  );
  const paidMonthlyBillsCount =
    activeMonthlyBills.length - unpaidMonthlyBills.length;
  const dueMonthlyBillsCount = unpaidMonthlyBills.filter((r) => r.isDue).length;
  const totalMonthlyAmount = activeMonthlyBills.reduce(
    (sum, r) => sum + r.amount,
    0
  );
  const remainingAmountThisMonth = unpaidMonthlyBills.reduce(
    (sum, r) => sum + r.amount,
    0
  );

  return {
    scope,
    month,
    totalBalance,
    previousMonthNet,
    currentMonthIncome,
    currentMonthExpense,
    currentMonthNet,
    savingRate,
    balanceGrowthPct,
    safeToSpend,
    activeWallets,
    watchedWallets,
    monthlySeries,
    topBudgets,
    recentTransactions,
    dueRecurring,
    monthlyBills: {
      totalCount: activeMonthlyBills.length,
      dueCount: dueMonthlyBillsCount,
      unpaidThisMonthCount: unpaidMonthlyBills.length,
      paidThisMonthCount: paidMonthlyBillsCount,
      totalMonthlyAmount,
      remainingAmountThisMonth,
      bills: activeMonthlyBills.slice(0, 5),
    },
    pendingInvites,
  };
}

/**
 * Generates an exact reconciled financial report for a single wallet (`viewer`+ access)
 * or across the user's active wallets (`owner`/`editor`, honoring `scope`), excluding
 * internal transfers from income/expense while reconciling opening -> closing balance.
 */
export async function getFinancialReport(
  db: AppDb,
  userId: string,
  query: {
    from: string;
    to: string;
    walletId?: string;
    scope?: ReportScope;
  }
): Promise<FinancialReport> {
  const from = assertValidIsoDate(query.from);
  const to = assertValidIsoDate(query.to);
  if (from > to) {
    throw new AppError(400, "Tanggal awal tidak boleh melebihi tanggal akhir.");
  }
  const scope = validateScope(query.scope);

  const isSingleWallet = Boolean(query.walletId?.trim());
  let selectedWalletRecords: Array<{
    id: string;
    name: string;
    initialBalance: number;
  }> = [];
  let resolvedWalletId: string | null = null;
  let resolvedWalletName: string | null = null;

  if (isSingleWallet) {
    const targetWalletId = query.walletId!.trim();
    const { wallet } = await assertWalletAccess(
      db,
      targetWalletId,
      userId,
      "viewer"
    );
    selectedWalletRecords = [
      {
        id: wallet.id,
        name: wallet.name,
        initialBalance: wallet.initialBalance,
      },
    ];
    resolvedWalletId = wallet.id;
    resolvedWalletName = wallet.name;
  } else {
    const { activeWallets } = await partitionUserWallets(db, userId, scope);
    selectedWalletRecords = activeWallets.map((w) => ({
      id: w.id,
      name: w.name,
      initialBalance: w.initialBalance,
    }));
  }

  const selectedWalletIds = selectedWalletRecords.map((w) => w.id);
  const selectedSet = new Set(selectedWalletIds);

  const sumInitialBalance = selectedWalletRecords.reduce(
    (sum, w) => sum + w.initialBalance,
    0
  );

  const [priorMovement, rawTxRes] = await Promise.all([
    getPriorMovementForWalletSet(db, selectedWalletIds, selectedSet, from),
    selectedWalletIds.length === 0
      ? Promise.resolve({
          items: [] as TransactionView[],
          summary: { income: 0, expense: 0, net: 0, count: 0 },
        })
      : isSingleWallet
        ? listTransactions(db, userId, {
            from,
            to,
            walletId: resolvedWalletId!,
          })
        : listTransactions(db, userId, { from, to }),
  ]);

  const openingBalance = sumInitialBalance + priorMovement;
  const reportTransactions: TransactionView[] = isSingleWallet
    ? rawTxRes.items
    : rawTxRes.items.filter(
        (tx) =>
          selectedSet.has(tx.walletId) ||
          (tx.targetWalletId !== null && selectedSet.has(tx.targetWalletId))
      );

  let totalIncome = 0;
  let totalExpense = 0;
  let transferIn = 0;
  let transferOut = 0;

  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const inclusiveDays = Math.round((toMs - fromMs) / 86_400_000) + 1;
  const groupByMonth = inclusiveDays > 45;

  const trendBuckets = new Map<string, { income: number; expense: number }>();

  for (const tx of reportTransactions) {
    if (tx.type === "income" && selectedSet.has(tx.walletId)) {
      totalIncome += tx.amount;
      const periodKey = groupByMonth
        ? tx.occurredAt.slice(0, 7)
        : tx.occurredAt;
      const bucket = trendBuckets.get(periodKey) ?? { income: 0, expense: 0 };
      bucket.income += tx.amount;
      trendBuckets.set(periodKey, bucket);
    } else if (tx.type === "expense" && selectedSet.has(tx.walletId)) {
      totalExpense += tx.amount;
      const periodKey = groupByMonth
        ? tx.occurredAt.slice(0, 7)
        : tx.occurredAt;
      const bucket = trendBuckets.get(periodKey) ?? { income: 0, expense: 0 };
      bucket.expense += tx.amount;
      trendBuckets.set(periodKey, bucket);
    } else if (tx.type === "transfer") {
      const srcIn = selectedSet.has(tx.walletId);
      const dstIn =
        tx.targetWalletId !== null && selectedSet.has(tx.targetWalletId);
      if (!srcIn && dstIn) {
        transferIn += tx.amount;
      } else if (srcIn && !dstIn) {
        transferOut += tx.amount;
      }
    }
  }

  const netChange = totalIncome - totalExpense + transferIn - transferOut;
  const closingBalance = openingBalance + netChange;
  const savingRate = computeSavingRate(totalIncome, totalExpense);

  const periods = enumerateTrendPeriods(
    from,
    to,
    groupByMonth,
    Array.from(trendBuckets.keys())
  );
  const trendSeries = periods.map((period) => {
    const entry = trendBuckets.get(period) ?? { income: 0, expense: 0 };
    return {
      period,
      label: groupByMonth ? formatMonthID(period) : formatDateID(period),
      income: entry.income,
      expense: entry.expense,
      net: entry.income - entry.expense,
    };
  });

  const incomeByCategory = buildCategoryBreakdown(
    reportTransactions,
    "income",
    selectedSet,
    totalIncome
  );
  const expenseByCategory = buildCategoryBreakdown(
    reportTransactions,
    "expense",
    selectedSet,
    totalExpense
  );

  return {
    from,
    to,
    scope,
    walletId: resolvedWalletId,
    walletName: resolvedWalletName,
    isSingleWallet,
    openingBalance,
    totalIncome,
    totalExpense,
    transferIn,
    transferOut,
    netChange,
    closingBalance,
    savingRate,
    transactionCount: reportTransactions.length,
    trendSeries,
    incomeByCategory,
    expenseByCategory,
    transactions: reportTransactions,
  };
}
