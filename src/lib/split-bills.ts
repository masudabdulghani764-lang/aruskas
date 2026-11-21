import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db";
import {
  splitBillParticipants,
  splitBills,
  transactions,
  users,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { assertValidIsoDate } from "@/lib/transactions";
import { assertWalletAccess } from "@/lib/wallets";

export type SplitBillParticipantView = {
  id: string;
  name: string;
  amount: number;
  isPaid: boolean;
  paidAt: string | null;
};

export type SplitBillView = {
  id: string;
  slug: string;
  transactionId: string | null;
  title: string;
  totalAmount: number;
  occurredAt: string;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  notes: string | null;
  createdAt: string;
  participants: SplitBillParticipantView[];
  paidCount: number;
  totalCount: number;
  paidAmount: number;
  unpaidAmount: number;
};

export type PublicSplitBillView = Omit<SplitBillView, "id" | "transactionId"> & {
  creatorName: string;
};

export const createSplitBillSchema = z.object({
  title: z
    .string({ required_error: "Judul patungan wajib diisi." })
    .trim()
    .min(2, "Judul patungan minimal 2 karakter.")
    .max(120, "Judul patungan maksimal 120 karakter."),
  totalAmount: z
    .number({
      required_error: "Total tagihan wajib diisi.",
      invalid_type_error: "Total tagihan harus berupa angka.",
    })
    .int("Total tagihan harus berupa bilangan bulat.")
    .positive("Total tagihan harus lebih dari Rp 0."),
  occurredAt: z
    .string({ required_error: "Tanggal wajib diisi." })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  transactionId: z.string().trim().min(1).nullable().optional(),
  bankName: z.string().trim().max(60).nullable().optional(),
  accountNumber: z.string().trim().max(60).nullable().optional(),
  accountHolder: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  participants: z
    .array(
      z.object({
        name: z
          .string({ required_error: "Nama peserta wajib diisi." })
          .trim()
          .min(1, "Nama peserta tidak boleh kosong.")
          .max(60, "Nama peserta maksimal 60 karakter."),
        amount: z
          .number({ invalid_type_error: "Nominal peserta harus berupa angka." })
          .int("Nominal peserta harus berupa bilangan bulat.")
          .positive("Nominal peserta harus lebih dari Rp 0."),
        isPaid: z.boolean().optional(),
      })
    )
    .min(2, "Minimal 2 peserta diperlukan untuk membuat patungan.")
    .max(30, "Maksimal 30 peserta per patungan."),
});

export const toggleParticipantPaidSchema = z.object({
  participantId: z
    .string({ required_error: "ID peserta wajib diisi." })
    .trim()
    .min(1),
  isPaid: z.boolean({ required_error: "Status pembayaran wajib diisi." }),
});

function buildSlug(title: string): string {
  const prefix = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  const rand = crypto.randomBytes(4).toString("hex");
  return prefix ? `${prefix}-${rand}` : `patungan-${rand}`;
}

function hydrateBill(
  bill: typeof splitBills.$inferSelect,
  parts: Array<typeof splitBillParticipants.$inferSelect>
): SplitBillView {
  const participants: SplitBillParticipantView[] = parts.map((p) => ({
    id: p.id,
    name: p.name,
    amount: Number(p.amount),
    isPaid: Boolean(p.isPaid),
    paidAt: p.paidAt,
  }));

  let paidCount = 0;
  let paidAmount = 0;
  for (const p of participants) {
    if (p.isPaid) {
      paidCount += 1;
      paidAmount += p.amount;
    }
  }
  const totalAmount = Number(bill.totalAmount);
  const unpaidAmount = Math.max(0, totalAmount - paidAmount);

  return {
    id: bill.id,
    slug: bill.slug,
    transactionId: bill.transactionId,
    title: bill.title,
    totalAmount,
    occurredAt: bill.occurredAt,
    bankName: bill.bankName,
    accountNumber: bill.accountNumber,
    accountHolder: bill.accountHolder,
    notes: bill.notes,
    createdAt: bill.createdAt,
    participants,
    paidCount,
    totalCount: participants.length,
    paidAmount,
    unpaidAmount,
  };
}

/**
 * Creates a shareable Split Bill (Patungan) linked optionally to an existing transaction.
 */
export async function createSplitBill(
  db: AppDb,
  userId: string,
  rawInput: z.input<typeof createSplitBillSchema>
): Promise<SplitBillView> {
  const input = createSplitBillSchema.parse(rawInput);
  const occurredAt = assertValidIsoDate(input.occurredAt);

  const participantSum = input.participants.reduce((s, p) => s + p.amount, 0);
  if (participantSum !== input.totalAmount) {
    throw new AppError(
      400,
      `Jumlah bagian peserta (Rp ${participantSum.toLocaleString("id-ID")}) harus sama dengan total tagihan (Rp ${input.totalAmount.toLocaleString("id-ID")}).`
    );
  }

  let verifiedTxId: string | null = null;
  if (input.transactionId) {
    const [tx] = await db
      .select({ id: transactions.id, walletId: transactions.walletId })
      .from(transactions)
      .where(eq(transactions.id, input.transactionId))
      .limit(1);

    if (!tx) {
      throw new AppError(404, "Transaksi terkait tidak ditemukan.");
    }
    await assertWalletAccess(db, tx.walletId, userId, "viewer");
    verifiedTxId = tx.id;
  }

  const now = new Date().toISOString();
  const billId = crypto.randomUUID();
  const slug = buildSlug(input.title);

  const billRow: typeof splitBills.$inferInsert = {
    id: billId,
    slug,
    userId,
    transactionId: verifiedTxId,
    title: input.title,
    totalAmount: input.totalAmount,
    occurredAt,
    bankName: input.bankName || null,
    accountNumber: input.accountNumber || null,
    accountHolder: input.accountHolder || null,
    notes: input.notes || null,
    createdAt: now,
    updatedAt: now,
  };

  const partRows: Array<typeof splitBillParticipants.$inferInsert> =
    input.participants.map((p) => ({
      id: crypto.randomUUID(),
      splitBillId: billId,
      name: p.name,
      amount: p.amount,
      isPaid: Boolean(p.isPaid),
      paidAt: p.isPaid ? now : null,
      createdAt: now,
    }));

  await db.transaction(async (tx) => {
    await tx.insert(splitBills).values(billRow);
    await tx.insert(splitBillParticipants).values(partRows);
  });

  return hydrateBill(
    billRow as typeof splitBills.$inferSelect,
    partRows as Array<typeof splitBillParticipants.$inferSelect>
  );
}

/**
 * Lists all split bills created by the authenticated user.
 */
export async function listUserSplitBills(
  db: AppDb,
  userId: string
): Promise<SplitBillView[]> {
  const bills = await db
    .select()
    .from(splitBills)
    .where(eq(splitBills.userId, userId))
    .orderBy(desc(splitBills.createdAt))
    .limit(50);

  if (bills.length === 0) {
    return [];
  }

  const billIds = bills.map((b) => b.id);
  const allParts = await db
    .select()
    .from(splitBillParticipants)
    .where(inArray(splitBillParticipants.splitBillId, billIds));

  const partsMap = new Map<
    string,
    Array<typeof splitBillParticipants.$inferSelect>
  >();
  for (const part of allParts) {
    const arr = partsMap.get(part.splitBillId) ?? [];
    arr.push(part);
    partsMap.set(part.splitBillId, arr);
  }

  return bills.map((b) => hydrateBill(b, partsMap.get(b.id) ?? []));
}

/**
 * Public read-only view of a split bill by its shareable slug.
 */
export async function getPublicSplitBillBySlug(
  db: AppDb,
  slug: string
): Promise<PublicSplitBillView | null> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug || cleanSlug.length > 64) {
    return null;
  }

  const [row] = await db
    .select({
      bill: splitBills,
      creatorName: users.name,
    })
    .from(splitBills)
    .innerJoin(users, eq(splitBills.userId, users.id))
    .where(eq(splitBills.slug, cleanSlug))
    .limit(1);

  if (!row) {
    return null;
  }

  const parts = await db
    .select()
    .from(splitBillParticipants)
    .where(eq(splitBillParticipants.splitBillId, row.bill.id));

  const hydrated = hydrateBill(row.bill, parts);
  return {
    slug: hydrated.slug,
    title: hydrated.title,
    totalAmount: hydrated.totalAmount,
    occurredAt: hydrated.occurredAt,
    bankName: hydrated.bankName,
    accountNumber: hydrated.accountNumber,
    accountHolder: hydrated.accountHolder,
    notes: hydrated.notes,
    createdAt: hydrated.createdAt,
    participants: hydrated.participants,
    paidCount: hydrated.paidCount,
    totalCount: hydrated.totalCount,
    paidAmount: hydrated.paidAmount,
    unpaidAmount: hydrated.unpaidAmount,
    creatorName: row.creatorName,
  };
}

/**
 * Marks a split bill participant as paid or unpaid (creator-only).
 */
export async function toggleSplitBillParticipantPaid(
  db: AppDb,
  userId: string,
  billId: string,
  participantId: string,
  isPaid: boolean
): Promise<SplitBillView> {
  const [bill] = await db
    .select()
    .from(splitBills)
    .where(and(eq(splitBills.id, billId), eq(splitBills.userId, userId)))
    .limit(1);

  if (!bill) {
    throw new AppError(404, "Patungan tidak ditemukan.");
  }

  const now = new Date().toISOString();
  const updated = await db
    .update(splitBillParticipants)
    .set({
      isPaid,
      paidAt: isPaid ? now : null,
    })
    .where(
      and(
        eq(splitBillParticipants.id, participantId),
        eq(splitBillParticipants.splitBillId, bill.id)
      )
    )
    .returning();

  if (updated.length === 0) {
    throw new AppError(404, "Peserta patungan tidak ditemukan.");
  }

  await db
    .update(splitBills)
    .set({ updatedAt: now })
    .where(eq(splitBills.id, bill.id));

  const parts = await db
    .select()
    .from(splitBillParticipants)
    .where(eq(splitBillParticipants.splitBillId, bill.id));

  return hydrateBill(bill, parts);
}

/**
 * Deletes a split bill owned by the authenticated user.
 */
export async function deleteSplitBill(
  db: AppDb,
  userId: string,
  billId: string
): Promise<void> {
  const deleted = await db
    .delete(splitBills)
    .where(and(eq(splitBills.id, billId), eq(splitBills.userId, userId)))
    .returning({ id: splitBills.id });

  if (deleted.length === 0) {
    throw new AppError(404, "Patungan tidak ditemukan.");
  }
}
