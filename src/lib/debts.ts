import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db";
import { categories, debts } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getTodayISO } from "@/lib/format";
import {
  assertValidIsoDate,
  insertTransactionInExecutor,
} from "@/lib/transactions";
import { indonesianEnumErrorMap } from "@/lib/wallets";

export type DebtType = "payable" | "receivable";
export type DebtStatus = "open" | "settled";

export type DebtView = {
  id: string;
  type: DebtType;
  personName: string;
  title: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  progressPct: number;
  dueDate: string | null;
  notes: string | null;
  status: DebtStatus;
  createdAt: string;
  updatedAt: string;
};

export type DebtsSummary = {
  totalPayableRemaining: number;
  totalReceivableRemaining: number;
  openCount: number;
  settledCount: number;
};

export const createDebtSchema = z.object({
  type: z.enum(["payable", "receivable"], {
    errorMap: indonesianEnumErrorMap(
      "Jenis catatan wajib dipilih.",
      "Jenis catatan harus Hutang (payable) atau Piutang (receivable)."
    ),
  }),
  personName: z
    .string({ required_error: "Nama pihak / kontak wajib diisi." })
    .trim()
    .min(1, "Nama pihak wajib diisi.")
    .max(80, "Nama pihak maksimal 80 karakter."),
  title: z
    .string({ required_error: "Keterangan hutang/piutang wajib diisi." })
    .trim()
    .min(2, "Keterangan minimal 2 karakter.")
    .max(120, "Keterangan maksimal 120 karakter."),
  totalAmount: z
    .number({
      required_error: "Total nominal wajib diisi.",
      invalid_type_error: "Total nominal harus berupa angka.",
    })
    .int("Total nominal harus berupa bilangan bulat.")
    .positive("Total nominal harus lebih dari Rp 0."),
  paidAmount: z
    .number({ invalid_type_error: "Nominal terbayar harus berupa angka." })
    .int("Nominal terbayar harus berupa bilangan bulat.")
    .min(0, "Nominal terbayar tidak boleh negatif.")
    .optional(),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal jatuh tempo harus YYYY-MM-DD.")
    .nullable()
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const recordDebtPaymentSchema = z.object({
  paymentAmount: z
    .number({
      required_error: "Nominal pembayaran wajib diisi.",
      invalid_type_error: "Nominal pembayaran harus berupa angka.",
    })
    .int("Nominal pembayaran harus berupa bilangan bulat.")
    .positive("Nominal pembayaran harus lebih dari Rp 0."),
  walletId: z.string().trim().min(1).nullable().optional(),
  occurredAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
    .optional(),
});

function toDebtView(row: typeof debts.$inferSelect): DebtView {
  const totalAmount = Number(row.totalAmount);
  const paidAmount = Number(row.paidAmount);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const progressPct =
    totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : 0;

  return {
    id: row.id,
    type: row.type,
    personName: row.personName,
    title: row.title,
    totalAmount,
    paidAmount,
    remainingAmount,
    progressPct,
    dueDate: row.dueDate,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listUserDebts(
  db: AppDb,
  userId: string
): Promise<{ items: DebtView[]; summary: DebtsSummary }> {
  const rows = await db
    .select()
    .from(debts)
    .where(eq(debts.userId, userId))
    .orderBy(desc(debts.createdAt))
    .limit(100);

  const items = rows.map(toDebtView);
  let totalPayableRemaining = 0;
  let totalReceivableRemaining = 0;
  let openCount = 0;
  let settledCount = 0;

  for (const item of items) {
    if (item.status === "settled") {
      settledCount += 1;
    } else {
      openCount += 1;
      if (item.type === "payable") {
        totalPayableRemaining += item.remainingAmount;
      } else {
        totalReceivableRemaining += item.remainingAmount;
      }
    }
  }

  return {
    items,
    summary: {
      totalPayableRemaining,
      totalReceivableRemaining,
      openCount,
      settledCount,
    },
  };
}

export async function createDebt(
  db: AppDb,
  userId: string,
  rawInput: z.input<typeof createDebtSchema>
): Promise<DebtView> {
  const input = createDebtSchema.parse(rawInput);
  const paidAmount = input.paidAmount ?? 0;
  if (paidAmount > input.totalAmount) {
    throw new AppError(
      400,
      "Nominal yang sudah dibayar tidak boleh melebihi total nominal."
    );
  }

  const dueDate = input.dueDate ? assertValidIsoDate(input.dueDate) : null;
  const now = new Date().toISOString();
  const status: DebtStatus = paidAmount >= input.totalAmount ? "settled" : "open";

  const [created] = await db
    .insert(debts)
    .values({
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      personName: input.personName,
      title: input.title,
      totalAmount: input.totalAmount,
      paidAmount,
      dueDate,
      notes: input.notes || null,
      status,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toDebtView(created!);
}

/**
 * Records a partial or full payment toward a debt/receivable, optionally creating
 * a synced wallet transaction (expense for paying debt, income for receiving receivable).
 */
export async function recordDebtPayment(
  db: AppDb,
  userId: string,
  debtId: string,
  rawInput: z.input<typeof recordDebtPaymentSchema>
): Promise<DebtView> {
  const input = recordDebtPaymentSchema.parse(rawInput);
  const [existing] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new AppError(404, "Catatan hutang/piutang tidak ditemukan.");
  }

  const remaining = Math.max(
    0,
    Number(existing.totalAmount) - Number(existing.paidAmount)
  );
  if (remaining <= 0) {
    throw new AppError(400, "Catatan ini sudah berstatus lunas.");
  }
  if (input.paymentAmount > remaining) {
    throw new AppError(
      400,
      `Nominal pembayaran melebihi sisa tagihan (Rp ${remaining.toLocaleString("id-ID")}).`
    );
  }

  const nextPaid = Number(existing.paidAmount) + input.paymentAmount;
  const nextStatus: DebtStatus =
    nextPaid >= Number(existing.totalAmount) ? "settled" : "open";
  const now = new Date().toISOString();
  const occurredAt = input.occurredAt
    ? assertValidIsoDate(input.occurredAt)
    : getTodayISO();

  const updatedRow = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(debts)
      .set({
        paidAmount: nextPaid,
        status: nextStatus,
        updatedAt: now,
      })
      .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
      .returning();

    if (input.walletId) {
      const txType = existing.type === "payable" ? "expense" : "income";
      const userCats = await tx
        .select({ id: categories.id, name: categories.name, type: categories.type })
        .from(categories)
        .where(and(eq(categories.userId, userId), eq(categories.type, txType)));

      const fallbackCat =
        userCats.find((c) => c.name.toLowerCase().includes("lain")) ??
        userCats[0];

      if (fallbackCat) {
        const prefix =
          existing.type === "payable" ? "Bayar Hutang" : "Terima Piutang";
        await insertTransactionInExecutor(tx as unknown as AppDb, userId, {
          walletId: input.walletId,
          categoryId: fallbackCat.id,
          type: txType,
          amount: input.paymentAmount,
          title: `${prefix} · ${existing.personName} (${existing.title})`.slice(
            0,
            120
          ),
          notes:
            nextStatus === "settled"
              ? "Pelunasan otomatis dari catatan Hutang & Piutang."
              : "Cicilan otomatis dari catatan Hutang & Piutang.",
          paymentMethod: "Transfer Bank",
          occurredAt,
        });
      }
    }

    return updated!;
  });

  return toDebtView(updatedRow);
}

export async function deleteDebt(
  db: AppDb,
  userId: string,
  debtId: string
): Promise<void> {
  const deleted = await db
    .delete(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .returning({ id: debts.id });

  if (deleted.length === 0) {
    throw new AppError(404, "Catatan hutang/piutang tidak ditemukan.");
  }
}
