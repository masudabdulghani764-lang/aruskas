import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AppDb } from "@/db";
import { categories, transactions, users, walletMembers, wallets } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { assertWalletAccess, type WalletRole } from "@/lib/wallets";

export type TransactionType = "income" | "expense" | "transfer";

export const REDACTED_WALLET_NAME = "Dompet Pribadi (Terkunci)";

export type TransactionView = {
  id: string;
  walletId: string;
  walletName: string;
  targetWalletId: string | null;
  targetWalletName: string | null;
  counterpartyWalletName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  userId: string;
  recorderName: string;
  type: TransactionType;
  amount: number;
  title: string;
  notes: string | null;
  paymentMethod: string | null;
  occurredAt: string;
  attachmentName: string | null;
  attachmentMime: string | null;
  hasAttachment: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateTransactionInput = {
  walletId: string;
  targetWalletId?: string | null;
  categoryId?: string | null;
  type: TransactionType;
  amount: number;
  title: string;
  notes?: string | null;
  paymentMethod?: string | null;
  occurredAt: string;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  recurringRuleId?: string | null;
};

export type UpdateTransactionInput = Partial<
  Omit<CreateTransactionInput, "recurringRuleId">
>;

export type TransactionFilter = {
  from?: string;
  to?: string;
  type?: TransactionType | "all";
  walletId?: string;
  categoryId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

type DbExecutor = Pick<AppDb, "select" | "insert" | "update" | "delete">;

/**
 * Validates that a Rupiah amount is a positive safe integer.
 */
export function assertPositiveIntAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError(
      400,
      "Nominal harus berupa bilangan bulat lebih dari 0."
    );
  }
  return amount;
}

/**
 * Validates a calendar date in strict `YYYY-MM-DD` format.
 */
export function assertValidIsoDate(isoDate: string): string {
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new AppError(
      400,
      "Format tanggal tidak valid (gunakan YYYY-MM-DD)."
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new AppError(400, "Tanggal tidak valid.");
  }
  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function addDelta(
  deltas: Map<string, number>,
  walletId: string,
  delta: number
): void {
  if (delta === 0) {
    return;
  }
  const next = (deltas.get(walletId) ?? 0) + delta;
  if (next === 0) {
    deltas.delete(walletId);
  } else {
    deltas.set(walletId, next);
  }
}

function collectTxDeltas(
  txRecord: {
    type: TransactionType;
    walletId: string;
    targetWalletId: string | null;
    amount: number;
  },
  sign: 1 | -1,
  deltas = new Map<string, number>()
): Map<string, number> {
  if (txRecord.type === "income") {
    addDelta(deltas, txRecord.walletId, sign * txRecord.amount);
  } else if (txRecord.type === "expense") {
    addDelta(deltas, txRecord.walletId, -sign * txRecord.amount);
  } else if (txRecord.type === "transfer" && txRecord.targetWalletId) {
    addDelta(deltas, txRecord.walletId, -sign * txRecord.amount);
    addDelta(deltas, txRecord.targetWalletId, sign * txRecord.amount);
  }
  return deltas;
}

function applyWalletDeltas(db: DbExecutor, deltas: Map<string, number>): void {
  for (const [walletId, delta] of deltas.entries()) {
    if (delta === 0) {
      continue;
    }
    db.update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${delta}`,
      })
      .where(eq(wallets.id, walletId))
      .run();
  }
}

function validateAndResolveTxFields(
  db: DbExecutor,
  userId: string,
  input: {
    walletId: string;
    targetWalletId?: string | null;
    categoryId?: string | null;
    type: TransactionType;
    amount: number;
    title: string;
    notes?: string | null;
    paymentMethod?: string | null;
    occurredAt: string;
  }
): {
  walletId: string;
  targetWalletId: string | null;
  categoryId: string | null;
  type: TransactionType;
  amount: number;
  title: string;
  notes: string | null;
  paymentMethod: string | null;
  occurredAt: string;
} {
  const amount = assertPositiveIntAmount(input.amount);
  const title = input.title.trim();
  if (!title) {
    throw new AppError(400, "Judul transaksi wajib diisi.");
  }
  const occurredAt = assertValidIsoDate(input.occurredAt);

  if (
    input.type !== "income" &&
    input.type !== "expense" &&
    input.type !== "transfer"
  ) {
    throw new AppError(400, "Tipe transaksi tidak valid.");
  }

  const sourceMembership = assertWalletAccess(
    db as AppDb,
    input.walletId,
    userId,
    "editor"
  );

  let targetWalletId: string | null = null;
  let categoryId: string | null = null;

  if (input.type === "transfer") {
    if (!input.targetWalletId) {
      throw new AppError(400, "Dompet tujuan wajib dipilih untuk transfer.");
    }
    if (input.targetWalletId === input.walletId) {
      throw new AppError(400, "Dompet tujuan harus berbeda dari dompet asal.");
    }
    assertWalletAccess(db as AppDb, input.targetWalletId, userId, "editor");
    targetWalletId = input.targetWalletId;
    categoryId = null;
  } else {
    if (!input.categoryId) {
      throw new AppError(400, "Kategori tidak valid untuk dompet ini.");
    }
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
      category.userId !== sourceMembership.wallet.ownerId ||
      category.type !== input.type
    ) {
      throw new AppError(400, "Kategori tidak valid untuk dompet ini.");
    }
    categoryId = category.id;
    targetWalletId = null;
  }

  return {
    walletId: input.walletId,
    targetWalletId,
    categoryId,
    type: input.type,
    amount,
    title,
    notes: normalizeOptionalText(input.notes),
    paymentMethod: normalizeOptionalText(input.paymentMethod),
    occurredAt,
  };
}

function buildTransactionViews(
  db: DbExecutor,
  rows: Array<typeof transactions.$inferSelect>,
  userId: string,
  contextWalletId?: string
): TransactionView[] {
  if (rows.length === 0) {
    return [];
  }

  const walletIdSet = new Set<string>();
  const categoryIdSet = new Set<string>();
  const userIdSet = new Set<string>();

  for (const row of rows) {
    walletIdSet.add(row.walletId);
    if (row.targetWalletId) {
      walletIdSet.add(row.targetWalletId);
    }
    if (row.categoryId) {
      categoryIdSet.add(row.categoryId);
    }
    userIdSet.add(row.userId);
  }

  const walletIds = Array.from(walletIdSet);
  const categoryIds = Array.from(categoryIdSet);
  const userIds = Array.from(userIdSet);

  const walletRows = db
    .select({ id: wallets.id, name: wallets.name })
    .from(wallets)
    .where(inArray(wallets.id, walletIds))
    .all();
  const walletNameMap = new Map(walletRows.map((w) => [w.id, w.name]));

  const memberRows = db
    .select({ walletId: walletMembers.walletId, role: walletMembers.role })
    .from(walletMembers)
    .where(
      and(
        eq(walletMembers.userId, userId),
        inArray(walletMembers.walletId, walletIds)
      )
    )
    .all();
  const membershipMap = new Map<string, WalletRole>(
    memberRows.map((m) => [m.walletId, m.role])
  );

  const categoryRows =
    categoryIds.length > 0
      ? db
          .select({
            id: categories.id,
            name: categories.name,
            color: categories.color,
            icon: categories.icon,
          })
          .from(categories)
          .where(inArray(categories.id, categoryIds))
          .all()
      : [];
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));

  const userRows = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds))
    .all();
  const userMap = new Map(userRows.map((u) => [u.id, u.name]));

  return rows.map((row) => {
    const sourceRole = membershipMap.get(row.walletId);
    const isSourceMember = sourceRole !== undefined;
    const isTargetMember = row.targetWalletId
      ? membershipMap.has(row.targetWalletId)
      : false;

    const walletName = isSourceMember
      ? (walletNameMap.get(row.walletId) ?? "Dompet")
      : REDACTED_WALLET_NAME;

    const targetWalletName = row.targetWalletId
      ? isTargetMember
        ? (walletNameMap.get(row.targetWalletId) ?? "Dompet")
        : REDACTED_WALLET_NAME
      : null;

    let counterpartyWalletName: string | null = null;
    if (row.type === "transfer") {
      if (contextWalletId && row.targetWalletId === contextWalletId) {
        counterpartyWalletName = walletName;
      } else if (contextWalletId && row.walletId === contextWalletId) {
        counterpartyWalletName = targetWalletName;
      } else if (!isSourceMember) {
        counterpartyWalletName = walletName;
      } else {
        counterpartyWalletName = targetWalletName;
      }
    }

    const cat = row.categoryId ? categoryMap.get(row.categoryId) : undefined;
    const canEdit =
      sourceRole === "owner" ||
      (sourceRole === "editor" && row.userId === userId);

    return {
      id: row.id,
      walletId: row.walletId,
      walletName,
      targetWalletId: row.targetWalletId,
      targetWalletName,
      counterpartyWalletName,
      categoryId: row.categoryId,
      categoryName: cat?.name ?? null,
      categoryColor: cat?.color ?? null,
      categoryIcon: cat?.icon ?? null,
      userId: row.userId,
      recorderName: userMap.get(row.userId) ?? "Pengguna",
      type: row.type,
      amount: row.amount,
      title: row.title,
      notes: row.notes,
      paymentMethod: row.paymentMethod,
      occurredAt: row.occurredAt,
      attachmentName: row.attachmentName,
      attachmentMime: row.attachmentMime,
      hasAttachment: Boolean(row.attachmentPath),
      canEdit,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

function isRecurringUniqueError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return msg.includes("unique") && msg.includes("recurring_rule_id");
}

/**
 * Inserts a validated transaction and adjusts wallet balance(s) within the provided
 * transaction/executor context. Used by both `createTransaction` and `applyRecurringRule`.
 */
export function insertTransactionInExecutor(
  tx: DbExecutor,
  userId: string,
  input: CreateTransactionInput
): TransactionView {
  const resolved = validateAndResolveTxFields(tx, userId, input);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    tx.insert(transactions)
      .values({
        id,
        walletId: resolved.walletId,
        targetWalletId: resolved.targetWalletId,
        categoryId: resolved.categoryId,
        userId,
        type: resolved.type,
        amount: resolved.amount,
        title: resolved.title,
        notes: resolved.notes,
        paymentMethod: resolved.paymentMethod,
        occurredAt: resolved.occurredAt,
        attachmentPath: input.attachmentPath ?? null,
        attachmentName: input.attachmentName ?? null,
        attachmentMime: input.attachmentMime ?? null,
        recurringRuleId: input.recurringRuleId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (err) {
    if (isRecurringUniqueError(err)) {
      throw new AppError(
        409,
        "Transaksi untuk jadwal rutin pada tanggal tersebut sudah dicatat."
      );
    }
    throw err;
  }

  const deltas = collectTxDeltas(resolved, 1);
  applyWalletDeltas(tx, deltas);

  const inserted = tx
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get()!;

  return buildTransactionViews(tx, [inserted], userId)[0];
}

/**
 * Creates a transaction and atomically updates affected wallet balance(s).
 */
export function createTransaction(
  db: AppDb,
  userId: string,
  input: CreateTransactionInput
): TransactionView {
  return db.transaction((tx) => insertTransactionInExecutor(tx, userId, input));
}

/**
 * Updates an existing transaction and atomically reconciles old and new wallet balances.
 */
export function updateTransaction(
  db: AppDb,
  txId: string,
  userId: string,
  input: UpdateTransactionInput
): TransactionView {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .get();

    if (!existing) {
      throw new AppError(404, "Transaksi tidak ditemukan.");
    }

    const existingMembership = assertWalletAccess(
      tx as unknown as AppDb,
      existing.walletId,
      userId,
      "editor"
    );
    if (existingMembership.role !== "owner" && existing.userId !== userId) {
      throw new AppError(
        403,
        "Anda hanya dapat mengubah transaksi yang Anda catat sendiri."
      );
    }

    const nextType = input.type ?? existing.type;
    const nextWalletId = input.walletId ?? existing.walletId;
    const nextTargetWalletId =
      nextType === "transfer"
        ? input.targetWalletId !== undefined
          ? input.targetWalletId
          : existing.targetWalletId
        : null;
    const nextCategoryId =
      nextType === "transfer"
        ? null
        : input.categoryId !== undefined
          ? input.categoryId
          : existing.categoryId;

    const resolved = validateAndResolveTxFields(tx, userId, {
      walletId: nextWalletId,
      targetWalletId: nextTargetWalletId,
      categoryId: nextCategoryId,
      type: nextType,
      amount: input.amount ?? existing.amount,
      title: input.title !== undefined ? input.title : existing.title,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      paymentMethod:
        input.paymentMethod !== undefined
          ? input.paymentMethod
          : existing.paymentMethod,
      occurredAt: input.occurredAt ?? existing.occurredAt,
    });

    const now = new Date().toISOString();
    const deltas = collectTxDeltas(existing, -1);
    collectTxDeltas(resolved, 1, deltas);
    applyWalletDeltas(tx, deltas);

    try {
      tx.update(transactions)
        .set({
          walletId: resolved.walletId,
          targetWalletId: resolved.targetWalletId,
          categoryId: resolved.categoryId,
          type: resolved.type,
          amount: resolved.amount,
          title: resolved.title,
          notes: resolved.notes,
          paymentMethod: resolved.paymentMethod,
          occurredAt: resolved.occurredAt,
          attachmentPath:
            input.attachmentPath !== undefined
              ? input.attachmentPath
              : existing.attachmentPath,
          attachmentName:
            input.attachmentName !== undefined
              ? input.attachmentName
              : existing.attachmentName,
          attachmentMime:
            input.attachmentMime !== undefined
              ? input.attachmentMime
              : existing.attachmentMime,
          updatedAt: now,
        })
        .where(eq(transactions.id, txId))
        .run();
    } catch (err) {
      if (isRecurringUniqueError(err)) {
        throw new AppError(
          409,
          "Transaksi untuk jadwal rutin pada tanggal tersebut sudah dicatat."
        );
      }
      throw err;
    }

    const updated = tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .get()!;

    return buildTransactionViews(tx, [updated], userId)[0];
  });
}

/**
 * Deletes a transaction and atomically reverses its wallet balance impact.
 * Returns the deleted attachment relative path (if any) for post-commit cleanup.
 */
export function deleteTransaction(
  db: AppDb,
  txId: string,
  userId: string
): { attachmentPath: string | null } {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .get();

    if (!existing) {
      throw new AppError(404, "Transaksi tidak ditemukan.");
    }

    const membership = assertWalletAccess(
      tx as unknown as AppDb,
      existing.walletId,
      userId,
      "editor"
    );
    if (membership.role !== "owner" && existing.userId !== userId) {
      throw new AppError(
        403,
        "Anda hanya dapat menghapus transaksi yang Anda catat sendiri."
      );
    }

    const deltas = collectTxDeltas(existing, -1);
    applyWalletDeltas(tx, deltas);
    tx.delete(transactions).where(eq(transactions.id, txId)).run();

    return { attachmentPath: existing.attachmentPath ?? null };
  });
}

/**
 * Returns a single transaction view if the user has at least viewer access on
 * either the source or target wallet, redacting any private counterparty wallet name.
 */
export function getTransactionById(
  db: AppDb,
  txId: string,
  userId: string
): TransactionView {
  const row = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, txId))
    .get();

  if (!row) {
    throw new AppError(404, "Transaksi tidak ditemukan.");
  }

  const walletScope = row.targetWalletId
    ? [row.walletId, row.targetWalletId]
    : [row.walletId];

  const membership = db
    .select({ id: walletMembers.id })
    .from(walletMembers)
    .where(
      and(
        eq(walletMembers.userId, userId),
        inArray(walletMembers.walletId, walletScope)
      )
    )
    .get();

  if (!membership) {
    throw new AppError(403, "Anda tidak memiliki akses ke transaksi ini.");
  }

  return buildTransactionViews(db, [row], userId)[0];
}

/**
 * Lists transactions visible to the user with dynamic filters, private transfer
 * redaction, and non-transfer summary totals.
 */
export function listTransactions(
  db: AppDb,
  userId: string,
  filters: TransactionFilter
): {
  items: TransactionView[];
  summary: { income: number; expense: number; net: number; count: number };
} {
  const conditions: SQL[] = [];

  if (filters.walletId) {
    assertWalletAccess(db, filters.walletId, userId, "viewer");
    conditions.push(
      or(
        eq(transactions.walletId, filters.walletId),
        eq(transactions.targetWalletId, filters.walletId)
      )!
    );
  } else {
    const memberWallets = db
      .select({ walletId: walletMembers.walletId })
      .from(walletMembers)
      .where(eq(walletMembers.userId, userId))
      .all();

    if (memberWallets.length === 0) {
      return {
        items: [],
        summary: { income: 0, expense: 0, net: 0, count: 0 },
      };
    }

    const walletIds = memberWallets.map((m) => m.walletId);
    conditions.push(
      or(
        inArray(transactions.walletId, walletIds),
        inArray(transactions.targetWalletId, walletIds)
      )!
    );
  }

  if (filters.from) {
    conditions.push(gte(transactions.occurredAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(transactions.occurredAt, filters.to));
  }
  if (filters.type && filters.type !== "all") {
    conditions.push(eq(transactions.type, filters.type));
  }
  if (filters.categoryId) {
    conditions.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters.search && filters.search.trim()) {
    const escaped = filters.search.trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    conditions.push(
      sql`(lower(${transactions.title}) LIKE ${pattern} ESCAPE '\\' OR lower(coalesce(${transactions.notes}, '')) LIKE ${pattern} ESCAPE '\\')`
    );
  }

  const whereClause = and(...conditions);

  const summaryRow = db
    .select({
      income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(whereClause)
    .get();

  const income = Number(summaryRow?.income ?? 0);
  const expense = Number(summaryRow?.expense ?? 0);
  const count = Number(summaryRow?.count ?? 0);

  const baseQuery = db
    .select()
    .from(transactions)
    .where(whereClause)
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

  let rows: Array<typeof transactions.$inferSelect>;
  if (filters.limit !== undefined && filters.offset !== undefined) {
    rows = baseQuery.limit(filters.limit).offset(filters.offset).all();
  } else if (filters.limit !== undefined) {
    rows = baseQuery.limit(filters.limit).all();
  } else if (filters.offset !== undefined) {
    rows = baseQuery.limit(-1).offset(filters.offset).all();
  } else {
    rows = baseQuery.all();
  }

  return {
    items: buildTransactionViews(db, rows, userId, filters.walletId),
    summary: {
      income,
      expense,
      net: income - expense,
      count,
    },
  };
}
