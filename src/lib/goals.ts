import { and, asc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db";
import { categories, savingsGoals, wallets } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getTodayISO } from "@/lib/format";
import {
  assertPositiveIntAmount,
  assertValidIsoDate,
  insertTransactionInExecutor,
} from "@/lib/transactions";
import { assertWalletAccess } from "@/lib/wallets";

export type SavingsGoalView = {
  id: string;
  name: string;
  walletId: string | null;
  walletName: string | null;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  percentage: number;
  deadline: string | null;
  notes: string | null;
  createdAt: string;
};

type DbExecutor = Pick<AppDb, "select" | "insert" | "update" | "delete">;

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function assertNonNegativeIntAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new AppError(
      400,
      "Saldo terkumpul awal harus berupa bilangan bulat minimal 0."
    );
  }
  return amount;
}

function toSavingsGoalView(row: {
  goal: typeof savingsGoals.$inferSelect;
  walletName: string | null;
}): SavingsGoalView {
  const { goal, walletName } = row;
  const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
  const percentage =
    Math.round((goal.currentAmount / goal.targetAmount) * 1000) / 10;

  return {
    id: goal.id,
    name: goal.name,
    walletId: goal.walletId,
    walletName,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    remainingAmount,
    percentage,
    deadline: goal.deadline,
    notes: goal.notes,
    createdAt: goal.createdAt,
  };
}

function loadOwnedGoal(
  db: DbExecutor,
  goalId: string,
  userId: string
): typeof savingsGoals.$inferSelect {
  const goal = db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.id, goalId))
    .get();

  if (!goal) {
    throw new AppError(404, "Target tabungan tidak ditemukan.");
  }
  if (goal.userId !== userId) {
    throw new AppError(
      403,
      "Anda tidak memiliki akses ke target tabungan ini."
    );
  }

  return goal;
}

function getSavingsGoalView(db: DbExecutor, goalId: string): SavingsGoalView {
  const row = db
    .select({
      goal: savingsGoals,
      walletName: wallets.name,
    })
    .from(savingsGoals)
    .leftJoin(wallets, eq(savingsGoals.walletId, wallets.id))
    .where(eq(savingsGoals.id, goalId))
    .get();

  if (!row) {
    throw new AppError(404, "Target tabungan tidak ditemukan.");
  }

  return toSavingsGoalView(row);
}

/**
 * Lists all savings goals owned by `userId` with remaining amount and progress percentage.
 */
export function listSavingsGoals(db: AppDb, userId: string): SavingsGoalView[] {
  const rows = db
    .select({
      goal: savingsGoals,
      walletName: wallets.name,
    })
    .from(savingsGoals)
    .leftJoin(wallets, eq(savingsGoals.walletId, wallets.id))
    .where(eq(savingsGoals.userId, userId))
    .orderBy(asc(savingsGoals.createdAt))
    .all();

  return rows.map(toSavingsGoalView);
}

/**
 * Creates a new savings goal, optionally linked to an accessible wallet.
 */
export function createSavingsGoal(
  db: AppDb,
  userId: string,
  input: {
    name: string;
    targetAmount: number;
    currentAmount?: number;
    walletId?: string | null;
    deadline?: string | null;
    notes?: string | null;
  }
): SavingsGoalView {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "Nama target tabungan wajib diisi.");
  }

  const targetAmount = assertPositiveIntAmount(input.targetAmount);
  const currentAmount = assertNonNegativeIntAmount(input.currentAmount ?? 0);

  const walletId = normalizeOptionalText(input.walletId);
  if (walletId) {
    assertWalletAccess(db, walletId, userId, "editor");
  }

  const rawDeadline = normalizeOptionalText(input.deadline);
  const deadline = rawDeadline ? assertValidIsoDate(rawDeadline) : null;
  const notes = normalizeOptionalText(input.notes);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.insert(savingsGoals)
    .values({
      id,
      userId,
      walletId,
      name,
      targetAmount,
      currentAmount,
      deadline,
      notes,
      createdAt,
    })
    .run();

  return getSavingsGoalView(db, id);
}

/**
 * Updates metadata or target configuration of a savings goal owned by `userId`.
 */
export function updateSavingsGoal(
  db: AppDb,
  userId: string,
  goalId: string,
  input: Partial<{
    name: string;
    targetAmount: number;
    walletId: string | null;
    deadline: string | null;
    notes: string | null;
  }>
): SavingsGoalView {
  loadOwnedGoal(db, goalId, userId);

  const patch: Partial<typeof savingsGoals.$inferInsert> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new AppError(400, "Nama target tabungan tidak boleh kosong.");
    }
    patch.name = trimmed;
  }

  if (input.targetAmount !== undefined) {
    patch.targetAmount = assertPositiveIntAmount(input.targetAmount);
  }

  if (input.walletId !== undefined) {
    const normalizedWalletId = normalizeOptionalText(input.walletId);
    if (normalizedWalletId) {
      assertWalletAccess(db, normalizedWalletId, userId, "editor");
    }
    patch.walletId = normalizedWalletId;
  }

  if (input.deadline !== undefined) {
    const normalizedDeadline = normalizeOptionalText(input.deadline);
    patch.deadline = normalizedDeadline
      ? assertValidIsoDate(normalizedDeadline)
      : null;
  }

  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(input.notes);
  }

  if (Object.keys(patch).length > 0) {
    db.update(savingsGoals)
      .set(patch)
      .where(eq(savingsGoals.id, goalId))
      .run();
  }

  return getSavingsGoalView(db, goalId);
}

/**
 * Deletes a savings goal owned by `userId`.
 */
export function deleteSavingsGoal(
  db: AppDb,
  userId: string,
  goalId: string
): void {
  loadOwnedGoal(db, goalId, userId);
  db.delete(savingsGoals).where(eq(savingsGoals.id, goalId)).run();
}

/**
 * Records a deposit into a savings goal either as a virtual progress update or as an
 * atomic wallet transfer / savings expense transaction.
 */
export function depositToSavingsGoal(
  db: AppDb,
  userId: string,
  goalId: string,
  input: {
    amount: number;
    mode: "wallet_transfer" | "virtual";
    sourceWalletId?: string | null;
    occurredAt?: string;
    notes?: string | null;
  }
): SavingsGoalView {
  const amount = assertPositiveIntAmount(input.amount);
  if (input.mode !== "wallet_transfer" && input.mode !== "virtual") {
    throw new AppError(400, "Mode setoran tidak valid.");
  }

  const occurredAt =
    input.occurredAt !== undefined
      ? assertValidIsoDate(input.occurredAt)
      : getTodayISO();
  const notes = normalizeOptionalText(input.notes);

  return db.transaction((tx) => {
    const goal = loadOwnedGoal(tx, goalId, userId);

    if (input.mode === "wallet_transfer") {
      const sourceWalletId = normalizeOptionalText(input.sourceWalletId);
      if (!sourceWalletId) {
        throw new AppError(
          400,
          "Dompet asal wajib dipilih untuk setoran dari dompet."
        );
      }

      const sourceMembership = assertWalletAccess(
        tx as unknown as AppDb,
        sourceWalletId,
        userId,
        "editor"
      );

      const txTitle = `Setoran Target: ${goal.name}`;

      if (goal.walletId && goal.walletId !== sourceWalletId) {
        insertTransactionInExecutor(tx, userId, {
          walletId: sourceWalletId,
          targetWalletId: goal.walletId,
          type: "transfer",
          amount,
          title: txTitle,
          notes,
          occurredAt,
        });
      } else {
        let savingsCategory = tx
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.userId, sourceMembership.wallet.ownerId),
              eq(categories.type, "expense"),
              eq(categories.name, "Tabungan & Investasi")
            )
          )
          .get();

        if (!savingsCategory) {
          savingsCategory = tx
            .insert(categories)
            .values({
              id: crypto.randomUUID(),
              userId: sourceMembership.wallet.ownerId,
              name: "Tabungan & Investasi",
              type: "expense",
              icon: "PiggyBank",
              color: "#10b981",
              isDefault: false,
              createdAt: new Date().toISOString(),
            })
            .returning({ id: categories.id })
            .get()!;
        }

        insertTransactionInExecutor(tx, userId, {
          walletId: sourceWalletId,
          categoryId: savingsCategory.id,
          type: "expense",
          amount,
          title: txTitle,
          notes,
          occurredAt,
        });
      }
    }

    tx.update(savingsGoals)
      .set({
        currentAmount: sql`${savingsGoals.currentAmount} + ${amount}`,
      })
      .where(eq(savingsGoals.id, goal.id))
      .run();

    return getSavingsGoalView(tx, goal.id);
  });
}
