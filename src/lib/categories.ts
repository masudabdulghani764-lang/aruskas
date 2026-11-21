import { and, asc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db";
import {
  budgets,
  categories,
  recurringRules,
  transactions,
  walletMembers,
  wallets,
} from "@/db/schema";
import { AppError } from "@/lib/errors";

export type CategoryRecord = typeof categories.$inferSelect;
export type CategoryType = "income" | "expense";

async function loadOwnedCategory(
  db: AppDb,
  userId: string,
  categoryId: string
): Promise<CategoryRecord> {
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!category) {
    throw new AppError(404, "Kategori tidak ditemukan.");
  }

  if (category.userId !== userId) {
    throw new AppError(403, "Anda tidak memiliki akses ke kategori ini.");
  }

  return category;
}

/**
 * Lists categories owned by `userId`, or by `opts.ownerId` when the caller
 * shares at least one wallet owned by `opts.ownerId`.
 */
export async function listCategories(
  db: AppDb,
  userId: string,
  opts?: { type?: CategoryType; ownerId?: string }
): Promise<CategoryRecord[]> {
  if (
    opts?.type !== undefined &&
    opts.type !== "income" &&
    opts.type !== "expense"
  ) {
    throw new AppError(
      400,
      "Tipe kategori harus pemasukan atau pengeluaran."
    );
  }

  const targetOwnerId = opts?.ownerId?.trim() || userId;
  if (targetOwnerId !== userId) {
    const [shared] = await db
      .select({ walletId: walletMembers.walletId })
      .from(walletMembers)
      .innerJoin(wallets, eq(walletMembers.walletId, wallets.id))
      .where(
        and(
          eq(walletMembers.userId, userId),
          eq(wallets.ownerId, targetOwnerId)
        )
      )
      .limit(1);

    if (!shared) {
      throw new AppError(
        403,
        "Anda tidak memiliki akses ke kategori pemilik dompet ini."
      );
    }
  }

  const condition = opts?.type
    ? and(
        eq(categories.userId, targetOwnerId),
        eq(categories.type, opts.type)
      )
    : eq(categories.userId, targetOwnerId);

  return db
    .select()
    .from(categories)
    .where(condition)
    .orderBy(asc(categories.createdAt), asc(categories.name));
}

/**
 * Creates a custom income or expense category for the authenticated user.
 */
export async function createCategory(
  db: AppDb,
  userId: string,
  input: { name: string; type: CategoryType; icon?: string; color?: string }
): Promise<CategoryRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "Nama kategori wajib diisi.");
  }

  if (input.type !== "income" && input.type !== "expense") {
    throw new AppError(
      400,
      "Tipe kategori harus pemasukan atau pengeluaran."
    );
  }

  const icon = input.icon?.trim() || "Tag";
  const color = input.color?.trim() || "#64748b";
  const now = new Date().toISOString();

  const [created] = await db
    .insert(categories)
    .values({
      id: crypto.randomUUID(),
      userId,
      name,
      type: input.type,
      icon,
      color,
      isDefault: false,
      createdAt: now,
    })
    .returning();

  return created!;
}

/**
 * Updates name, icon, or color of an existing category owned by `userId`.
 */
export async function updateCategory(
  db: AppDb,
  userId: string,
  categoryId: string,
  input: { name?: string; icon?: string; color?: string }
): Promise<CategoryRecord> {
  const existing = await loadOwnedCategory(db, userId, categoryId);
  const patch: Partial<typeof categories.$inferInsert> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new AppError(400, "Nama kategori tidak boleh kosong.");
    }
    patch.name = trimmed;
  }

  if (input.icon !== undefined) {
    const trimmed = input.icon.trim();
    if (!trimmed) {
      throw new AppError(400, "Ikon kategori tidak boleh kosong.");
    }
    patch.icon = trimmed;
  }

  if (input.color !== undefined) {
    const trimmed = input.color.trim();
    if (!trimmed) {
      throw new AppError(400, "Warna kategori tidak boleh kosong.");
    }
    patch.color = trimmed;
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  const [updated] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, categoryId))
    .returning();

  return updated!;
}

/**
 * Deletes an unreferenced category owned by `userId`, throwing 409 if it is still
 * referenced by any transaction, budget, or recurring rule.
 */
export async function deleteCategory(
  db: AppDb,
  userId: string,
  categoryId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await loadOwnedCategory(tx as unknown as AppDb, userId, categoryId);

    const [[txRow], [budgetRow], [recurringRow]] = await Promise.all([
      tx
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(eq(transactions.categoryId, categoryId)),
      tx
        .select({ count: sql<number>`count(*)` })
        .from(budgets)
        .where(eq(budgets.categoryId, categoryId)),
      tx
        .select({ count: sql<number>`count(*)` })
        .from(recurringRules)
        .where(eq(recurringRules.categoryId, categoryId)),
    ]);

    const txCount = Number(txRow?.count ?? 0);
    const budgetCount = Number(budgetRow?.count ?? 0);
    const recurringCount = Number(recurringRow?.count ?? 0);

    const total = txCount + budgetCount + recurringCount;
    if (total > 0) {
      throw new AppError(
        409,
        `Kategori masih digunakan pada ${total} data (transaksi/anggaran/jadwal rutin) dan tidak dapat dihapus.`
      );
    }

    await tx.delete(categories).where(eq(categories.id, categoryId));
  });
}
