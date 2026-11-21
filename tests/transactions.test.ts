import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, getDb } from "@/db";
import { categories, recurringRules, transactions, users, wallets } from "@/db/schema";
import {
  DEMO_PARTNER_EMAIL,
  SESSION_COOKIE_NAME,
  registerUser,
} from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ensureDemoSeeded } from "@/lib/seed";
import {
  MAX_ATTACHMENT_BYTES,
  readAttachmentBuffer,
  saveAttachment,
} from "@/lib/attachments";
import {
  advanceDate,
  applyRecurringRule,
  createRecurringRule,
  deleteRecurringRule,
  listDueRecurringRules,
  listRecurringRules,
  skipRecurringRule,
  updateRecurringRule,
} from "@/lib/recurring";
import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
  listTransactions,
  updateTransaction,
} from "@/lib/transactions";
import {
  acceptWalletInvite,
  createWallet,
  createWalletInvite,
} from "@/lib/wallets";

let mockSessionCookie: string | undefined;

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && mockSessionCookie
        ? { name, value: mockSessionCookie }
        : undefined,
  }),
}));

import { GET as downloadAttachmentRoute } from "@/app/api/attachments/[transactionId]/route";
import { POST as applyRecurringRoute } from "@/app/api/recurring/[id]/apply/route";
import {
  DELETE as deleteRecurringRoute,
  PATCH as updateRecurringRoute,
} from "@/app/api/recurring/[id]/route";
import { POST as skipRecurringRoute } from "@/app/api/recurring/[id]/skip/route";
import {
  GET as listRecurringRoute,
  POST as createRecurringRoute,
} from "@/app/api/recurring/route";
import {
  DELETE as deleteTransactionRoute,
  GET as getTransactionRoute,
  PATCH as updateTransactionRoute,
} from "@/app/api/transactions/[id]/route";
import {
  GET as listTransactionsRoute,
  POST as createTransactionRoute,
} from "@/app/api/transactions/route";

async function expectAppError(
  fn: () => unknown | Promise<unknown>,
  expectedStatus: number
): Promise<AppError> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(AppError);
  const appErr = caught as AppError;
  expect(appErr.status).toBe(expectedStatus);
  return appErr;
}

function getUserCategory(
  db: ReturnType<typeof createDb>["db"],
  userId: string,
  type: "income" | "expense",
  index = 0
) {
  const rows = db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .all()
    .filter((c) => c.type === type);
  expect(rows.length).toBeGreaterThan(index);
  return rows[index];
}

function getWalletBalance(
  db: ReturnType<typeof createDb>["db"],
  walletId: string
): number {
  const row = db
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .get();
  expect(row).toBeDefined();
  return row!.balance;
}

describe("Atomic Transactions Engine, Attachments & Recurring Rules", () => {
  test("atomic balance updates across create, update (amount/type/wallet/target), and delete leave zero balance drift", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Raka",
        email: "raka@aruskas.test",
        password: "Password123!",
      });

      const bca = createWallet(db, reg.user.id, {
        name: "Bank BCA",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const tunai = createWallet(db, reg.user.id, {
        name: "Tunai",
        type: "cash",
        initialBalance: 200_000,
      });
      const tabungan = createWallet(db, reg.user.id, {
        name: "Tabungan",
        type: "savings",
        initialBalance: 500_000,
      });

      const incomeCat = getUserCategory(db, reg.user.id, "income");
      const expenseCat = getUserCategory(db, reg.user.id, "expense");

      // 1. Income +500.000 on BCA -> 1.500.000
      const txIncome = createTransaction(db, reg.user.id, {
        walletId: bca.id,
        categoryId: incomeCat.id,
        type: "income",
        amount: 500_000,
        title: "Bonus Proyek",
        occurredAt: "2026-11-01",
      });
      expect(txIncome.amount).toBe(500_000);
      expect(txIncome.canEdit).toBe(true);
      expect(getWalletBalance(db, bca.id)).toBe(1_500_000);

      // 2. Expense -150.000 on BCA -> 1.350.000
      const txExpense = createTransaction(db, reg.user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 150_000,
        title: "Belanja Harian",
        occurredAt: "2026-11-02",
      });
      expect(getWalletBalance(db, bca.id)).toBe(1_350_000);

      // 3. Transfer 300.000 BCA -> Tunai (BCA 1.050.000, Tunai 500.000)
      const txTransfer = createTransaction(db, reg.user.id, {
        walletId: bca.id,
        targetWalletId: tunai.id,
        categoryId: expenseCat.id, // Must be forced null on transfer
        type: "transfer",
        amount: 300_000,
        title: "Tarik Tunai ATM",
        occurredAt: "2026-11-03",
      });
      expect(txTransfer.categoryId).toBeNull();
      expect(txTransfer.targetWalletId).toBe(tunai.id);
      expect(txTransfer.counterpartyWalletName).toBe("Tunai");
      expect(getWalletBalance(db, bca.id)).toBe(1_050_000);
      expect(getWalletBalance(db, tunai.id)).toBe(500_000);

      // 4. Update expense amount 150.000 -> 250.000 (BCA: 950.000)
      const updatedAmount = updateTransaction(db, txExpense.id, reg.user.id, {
        amount: 250_000,
      });
      expect(updatedAmount.amount).toBe(250_000);
      expect(getWalletBalance(db, bca.id)).toBe(950_000);

      // 5. Update expense (250k) -> income (250k) on BCA (+500k -> 1.450.000)
      const updatedType = updateTransaction(db, txExpense.id, reg.user.id, {
        type: "income",
        categoryId: incomeCat.id,
      });
      expect(updatedType.type).toBe("income");
      expect(getWalletBalance(db, bca.id)).toBe(1_450_000);

      // 6. Update income wallet from BCA -> Tunai (BCA: 1.200.000, Tunai: 750.000)
      updateTransaction(db, txExpense.id, reg.user.id, {
        walletId: tunai.id,
      });
      expect(getWalletBalance(db, bca.id)).toBe(1_200_000);
      expect(getWalletBalance(db, tunai.id)).toBe(750_000);

      // 7. Update transfer target Tunai -> Tabungan and amount 300k -> 400k
      // BCA: 1.200.000 + 300.000 - 400.000 = 1.100.000
      // Tunai: 750.000 - 300.000 = 450.000
      // Tabungan: 500.000 + 400.000 = 900.000
      const updatedTransfer = updateTransaction(
        db,
        txTransfer.id,
        reg.user.id,
        {
          targetWalletId: tabungan.id,
          amount: 400_000,
        }
      );
      expect(updatedTransfer.targetWalletId).toBe(tabungan.id);
      expect(getWalletBalance(db, bca.id)).toBe(1_100_000);
      expect(getWalletBalance(db, tunai.id)).toBe(450_000);
      expect(getWalletBalance(db, tabungan.id)).toBe(900_000);

      // List filtering & summary (transfer excluded from summary income/expense)
      const listAll = listTransactions(db, reg.user.id, {});
      expect(listAll.summary).toEqual({
        income: 750_000,
        expense: 0,
        net: 750_000,
        count: 3,
      });
      expect(listAll.items).toHaveLength(3);

      const paginated = listTransactions(db, reg.user.id, {
        limit: 1,
        offset: 1,
      });
      expect(paginated.items).toHaveLength(1);
      expect(paginated.summary.count).toBe(3);

      const searchFiltered = listTransactions(db, reg.user.id, {
        search: "Bonus",
      });
      expect(searchFiltered.items).toHaveLength(1);
      expect(searchFiltered.items[0].id).toBe(txIncome.id);

      // 8. Delete all transactions -> exact initial balances restored
      deleteTransaction(db, txIncome.id, reg.user.id);
      deleteTransaction(db, txExpense.id, reg.user.id);
      deleteTransaction(db, txTransfer.id, reg.user.id);

      expect(getWalletBalance(db, bca.id)).toBe(1_000_000);
      expect(getWalletBalance(db, tunai.id)).toBe(200_000);
      expect(getWalletBalance(db, tabungan.id)).toBe(500_000);
    } finally {
      sqlite.close();
    }
  });

  test("shared wallet RBAC: editor uses owner category, edits/deletes own tx, gets 403 on owner tx; viewer gets 403", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Raka",
        email: "owner@aruskas.test",
        password: "Password123!",
      });
      const editor = await registerUser(db, {
        name: "Nadia",
        email: "editor@aruskas.test",
        password: "Password123!",
      });
      const viewer = await registerUser(db, {
        name: "Budi",
        email: "viewer@aruskas.test",
        password: "Password123!",
      });

      const sharedWallet = createWallet(db, owner.user.id, {
        name: "Kas Rumah Tangga",
        type: "bank",
        initialBalance: 2_000_000,
      });

      const editorInvite = createWalletInvite(
        db,
        sharedWallet.id,
        owner.user.id,
        {
          email: editor.user.email,
          role: "editor",
        }
      );
      acceptWalletInvite(db, editorInvite.token, editor.user);

      const viewerInvite = createWalletInvite(
        db,
        sharedWallet.id,
        owner.user.id,
        {
          email: viewer.user.email,
          role: "viewer",
        }
      );
      acceptWalletInvite(db, viewerInvite.token, viewer.user);

      const ownerExpenseCat = getUserCategory(db, owner.user.id, "expense");
      const ownerIncomeCat = getUserCategory(db, owner.user.id, "income");
      const editorExpenseCat = getUserCategory(db, editor.user.id, "expense");

      // Viewer cannot create transaction -> 403
      await expectAppError(
        () =>
          createTransaction(db, viewer.user.id, {
            walletId: sharedWallet.id,
            categoryId: ownerExpenseCat.id,
            type: "expense",
            amount: 50_000,
            title: "Coba Catat",
            occurredAt: "2026-11-10",
          }),
        403
      );

      // Editor cannot use their own category ID on owner's wallet -> 400
      await expectAppError(
        () =>
          createTransaction(db, editor.user.id, {
            walletId: sharedWallet.id,
            categoryId: editorExpenseCat.id,
            type: "expense",
            amount: 50_000,
            title: "Kategori Salah",
            occurredAt: "2026-11-10",
          }),
        400
      );

      // Editor cannot mismatch category type (income cat for expense) -> 400
      await expectAppError(
        () =>
          createTransaction(db, editor.user.id, {
            walletId: sharedWallet.id,
            categoryId: ownerIncomeCat.id,
            type: "expense",
            amount: 50_000,
            title: "Tipe Kategori Salah",
            occurredAt: "2026-11-10",
          }),
        400
      );

      // Editor creates tx using owner's category -> succeeds
      const editorTx = createTransaction(db, editor.user.id, {
        walletId: sharedWallet.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 120_000,
        title: "Belanja Sayur",
        occurredAt: "2026-11-10",
      });
      expect(editorTx.canEdit).toBe(true);
      expect(getWalletBalance(db, sharedWallet.id)).toBe(1_880_000);

      // Owner creates tx in shared wallet
      const ownerTx = createTransaction(db, owner.user.id, {
        walletId: sharedWallet.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 200_000,
        title: "Bayar Listrik",
        occurredAt: "2026-11-11",
      });
      expect(getWalletBalance(db, sharedWallet.id)).toBe(1_680_000);

      // Editor cannot edit or delete owner's tx -> 403
      const editorList = listTransactions(db, editor.user.id, {
        walletId: sharedWallet.id,
      });
      const ownerTxForEditor = editorList.items.find(
        (t) => t.id === ownerTx.id
      );
      const editorTxForEditor = editorList.items.find(
        (t) => t.id === editorTx.id
      );
      expect(ownerTxForEditor?.canEdit).toBe(false);
      expect(editorTxForEditor?.canEdit).toBe(true);

      const errEditOwner = await expectAppError(
        () =>
          updateTransaction(db, ownerTx.id, editor.user.id, {
            amount: 300_000,
          }),
        403
      );
      expect(errEditOwner.message).toBe(
        "Anda hanya dapat mengubah transaksi yang Anda catat sendiri."
      );

      await expectAppError(
        () => deleteTransaction(db, ownerTx.id, editor.user.id),
        403
      );

      // Viewer sees canEdit === false and gets 403 editing/deleting
      const viewerView = getTransactionById(db, editorTx.id, viewer.user.id);
      expect(viewerView.canEdit).toBe(false);
      await expectAppError(
        () =>
          updateTransaction(db, editorTx.id, viewer.user.id, { title: "Edit" }),
        403
      );
      await expectAppError(
        () => deleteTransaction(db, editorTx.id, viewer.user.id),
        403
      );

      // Editor CAN edit and delete their own tx
      const edited = updateTransaction(db, editorTx.id, editor.user.id, {
        amount: 100_000,
      });
      expect(edited.amount).toBe(100_000);
      expect(getWalletBalance(db, sharedWallet.id)).toBe(1_700_000);

      deleteTransaction(db, editorTx.id, editor.user.id);
      expect(getWalletBalance(db, sharedWallet.id)).toBe(1_800_000);

      // Owner CAN delete ownerTx (and could edit/delete editorTx too)
      const editorTx2 = createTransaction(db, editor.user.id, {
        walletId: sharedWallet.id,
        categoryId: ownerExpenseCat.id,
        type: "expense",
        amount: 50_000,
        title: "Parkir",
        occurredAt: "2026-11-12",
      });
      expect(
        getTransactionById(db, editorTx2.id, owner.user.id).canEdit
      ).toBe(true);
      updateTransaction(db, editorTx2.id, owner.user.id, { amount: 60_000 });
      deleteTransaction(db, editorTx2.id, owner.user.id);
      expect(getWalletBalance(db, sharedWallet.id)).toBe(1_800_000);
    } finally {
      sqlite.close();
    }
  });

  test("private transfer redaction hides private counterparty wallet names from shared wallet members", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia@aruskas.test",
        password: "Password123!",
      });
      const outsider = await registerUser(db, {
        name: "Orang Luar",
        email: "outsider@aruskas.test",
        password: "Password123!",
      });

      const privateWallet = createWallet(db, owner.user.id, {
        name: "BCA Pribadi Raka",
        type: "bank",
        initialBalance: 10_000_000,
      });
      const sharedWallet = createWallet(db, owner.user.id, {
        name: "Kas Rumah Tangga",
        type: "bank",
        initialBalance: 1_000_000,
      });

      const inv = createWalletInvite(db, sharedWallet.id, owner.user.id, {
        email: partner.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, inv.token, partner.user);

      // Private -> Shared transfer
      const inboundTransfer = createTransaction(db, owner.user.id, {
        walletId: privateWallet.id,
        targetWalletId: sharedWallet.id,
        type: "transfer",
        amount: 2_500_000,
        title: "Setoran Bulanan",
        occurredAt: "2026-11-05",
      });

      // Shared -> Private transfer
      const outboundTransfer = createTransaction(db, owner.user.id, {
        walletId: sharedWallet.id,
        targetWalletId: privateWallet.id,
        type: "transfer",
        amount: 500_000,
        title: "Pengembalian Talangan",
        occurredAt: "2026-11-06",
      });

      // Owner sees real names on both
      const ownerInbound = getTransactionById(
        db,
        inboundTransfer.id,
        owner.user.id
      );
      expect(ownerInbound.walletName).toBe("BCA Pribadi Raka");
      expect(ownerInbound.targetWalletName).toBe("Kas Rumah Tangga");

      // Partner sees redacted source on inbound transfer
      const partnerInbound = getTransactionById(
        db,
        inboundTransfer.id,
        partner.user.id
      );
      expect(partnerInbound.walletName).toBe("Dompet Pribadi (Terkunci)");
      expect(partnerInbound.counterpartyWalletName).toBe(
        "Dompet Pribadi (Terkunci)"
      );
      expect(partnerInbound.targetWalletName).toBe("Kas Rumah Tangga");
      expect(partnerInbound.canEdit).toBe(false);

      // Partner sees redacted target on outbound transfer
      const partnerOutbound = getTransactionById(
        db,
        outboundTransfer.id,
        partner.user.id
      );
      expect(partnerOutbound.walletName).toBe("Kas Rumah Tangga");
      expect(partnerOutbound.targetWalletName).toBe(
        "Dompet Pribadi (Terkunci)"
      );
      expect(partnerOutbound.counterpartyWalletName).toBe(
        "Dompet Pribadi (Terkunci)"
      );

      // ListTransactions (both unfiltered and filtered by sharedWallet) redacts private side
      const partnerList = listTransactions(db, partner.user.id, {
        walletId: sharedWallet.id,
      });
      expect(partnerList.items).toHaveLength(2);
      const listedInbound = partnerList.items.find(
        (t) => t.id === inboundTransfer.id
      )!;
      expect(listedInbound.walletName).toBe("Dompet Pribadi (Terkunci)");
      expect(listedInbound.counterpartyWalletName).toBe(
        "Dompet Pribadi (Terkunci)"
      );

      // Outsider gets 403 on getTransactionById and filtered listTransactions
      await expectAppError(
        () => getTransactionById(db, inboundTransfer.id, outsider.user.id),
        403
      );
      await expectAppError(
        () =>
          listTransactions(db, outsider.user.id, {
            walletId: sharedWallet.id,
          }),
        403
      );
    } finally {
      sqlite.close();
    }
  });

  test("Review Focus: rejects invalid amounts (<=0, NaN, decimal) and self/unauthorized transfers without changing balances", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const userA = await registerUser(db, {
        name: "Andi",
        email: "andi@aruskas.test",
        password: "Password123!",
      });
      const userB = await registerUser(db, {
        name: "Siti",
        email: "siti@aruskas.test",
        password: "Password123!",
      });

      const walletA = createWallet(db, userA.user.id, {
        name: "Dompet Andi",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const walletBViewer = createWallet(db, userB.user.id, {
        name: "Dompet Siti Viewer",
        type: "bank",
        initialBalance: 500_000,
      });
      const walletBPrivate = createWallet(db, userB.user.id, {
        name: "Dompet Siti Rahasia",
        type: "cash",
        initialBalance: 300_000,
      });

      const viewerInv = createWalletInvite(db, walletBViewer.id, userB.user.id, {
        email: userA.user.email,
        role: "viewer",
      });
      acceptWalletInvite(db, viewerInv.token, userA.user);

      const catA = getUserCategory(db, userA.user.id, "expense");

      // Invalid amounts: 0, negative, NaN, Infinity, decimal 1500.5
      for (const badAmount of [0, -10000, Number.NaN, Infinity, 1500.5]) {
        const err = await expectAppError(
          () =>
            createTransaction(db, userA.user.id, {
              walletId: walletA.id,
              categoryId: catA.id,
              type: "expense",
              amount: badAmount,
              title: "Nominal Tidak Valid",
              occurredAt: "2026-11-15",
            }),
          400
        );
        expect(err.message).toBe("Nominal harus berupa bilangan bulat lebih dari 0.");
      }
      expect(getWalletBalance(db, walletA.id)).toBe(1_000_000);

      // Self transfer: walletId === targetWalletId -> 400
      const selfErr = await expectAppError(
        () =>
          createTransaction(db, userA.user.id, {
            walletId: walletA.id,
            targetWalletId: walletA.id,
            type: "transfer",
            amount: 100_000,
            title: "Transfer Diri Sendiri",
            occurredAt: "2026-11-15",
          }),
        400
      );
      expect(selfErr.message).toBe(
        "Dompet tujuan harus berbeda dari dompet asal."
      );
      expect(getWalletBalance(db, walletA.id)).toBe(1_000_000);

      // Transfer to wallet where user is only viewer -> 403, neither balance changed
      await expectAppError(
        () =>
          createTransaction(db, userA.user.id, {
            walletId: walletA.id,
            targetWalletId: walletBViewer.id,
            type: "transfer",
            amount: 100_000,
            title: "Transfer ke Viewer",
            occurredAt: "2026-11-15",
          }),
        403
      );
      expect(getWalletBalance(db, walletA.id)).toBe(1_000_000);
      expect(getWalletBalance(db, walletBViewer.id)).toBe(500_000);

      // Transfer to non-member wallet -> 403, neither balance changed
      await expectAppError(
        () =>
          createTransaction(db, userA.user.id, {
            walletId: walletA.id,
            targetWalletId: walletBPrivate.id,
            type: "transfer",
            amount: 100_000,
            title: "Transfer ke Non-Member",
            occurredAt: "2026-11-15",
          }),
        403
      );
      expect(getWalletBalance(db, walletA.id)).toBe(1_000_000);
      expect(getWalletBalance(db, walletBPrivate.id)).toBe(300_000);
    } finally {
      sqlite.close();
    }
  });

  test("attachments validate MIME and max 2MB size, save UUID files, and guard against path traversal", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-att-"));
    try {
      // Invalid MIME -> 400
      await expectAppError(
        () =>
          saveAttachment(
            {
              name: "malware.exe",
              type: "application/x-msdownload",
              buffer: new Uint8Array([1, 2, 3]),
            },
            tempDir
          ),
        400
      );

      // Oversized buffer > 2MB -> 400
      await expectAppError(
        () =>
          saveAttachment(
            {
              name: "huge.png",
              type: "image/png",
              buffer: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
            },
            tempDir
          ),
        400
      );

      // Empty buffer -> 400
      await expectAppError(
        () =>
          saveAttachment(
            {
              name: "empty.pdf",
              type: "application/pdf",
              buffer: new Uint8Array(0),
            },
            tempDir
          ),
        400
      );

      // Valid PNG & PDF
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const savedPng = await saveAttachment(
        {
          name: "../../nota-kopi.png",
          type: "image/png",
          buffer: pngBytes,
        },
        tempDir
      );
      expect(savedPng.mime).toBe("image/png");
      expect(savedPng.name).toBe("nota-kopi.png");
      expect(savedPng.path).toMatch(/^[0-9a-f-]+\.png$/);
      expect(fs.existsSync(path.join(tempDir, savedPng.path))).toBe(true);

      const loadedPng = await readAttachmentBuffer(savedPng.path, tempDir);
      expect(Array.from(loadedPng)).toEqual(Array.from(pngBytes));

      const pdfBytes = new TextEncoder().encode("%PDF-1.4\n...");
      const savedPdf = await saveAttachment(
        {
          name: "kwitansi.pdf",
          type: "application/pdf",
          buffer: pdfBytes,
        },
        tempDir
      );
      expect(savedPdf.path).toMatch(/\.pdf$/);
      const loadedPdf = await readAttachmentBuffer(savedPdf.path, tempDir);
      expect(Array.from(loadedPdf)).toEqual(Array.from(pdfBytes));

      // Path traversal guards -> 400
      await expectAppError(
        () => readAttachmentBuffer("../outside.txt", tempDir),
        400
      );
      await expectAppError(
        () => readAttachmentBuffer("..\\..\\Windows\\win.ini", tempDir),
        400
      );
      await expectAppError(
        () => readAttachmentBuffer(path.join(tempDir, savedPng.path), tempDir),
        400
      );
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore temp dir cleanup issues
      }
    }
  });

  test("recurring rules: advanceDate clamping, owner-only creation, apply (with overrideAmount), skip, delete after apply, and duplicate idempotency", async () => {
    // 1. advanceDate unit cases
    expect(advanceDate("2026-11-01", "weekly")).toBe("2026-11-08");
    expect(advanceDate("2026-12-28", "weekly")).toBe("2027-01-04");
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2024-01-31", "monthly")).toBe("2024-02-29");
    expect(advanceDate("2026-03-31", "monthly")).toBe("2026-04-30");
    expect(advanceDate("2026-12-31", "monthly")).toBe("2027-01-31");

    const { db, sqlite } = createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka@aruskas.test",
        password: "Password123!",
      });
      const editor = await registerUser(db, {
        name: "Nadia",
        email: "nadia@aruskas.test",
        password: "Password123!",
      });

      const wallet = createWallet(db, owner.user.id, {
        name: "Kas Rutin",
        type: "bank",
        initialBalance: 5_000_000,
      });
      const inv = createWalletInvite(db, wallet.id, owner.user.id, {
        email: editor.user.email,
        role: "editor",
      });
      acceptWalletInvite(db, inv.token, editor.user);

      const expenseCat = getUserCategory(db, owner.user.id, "expense");
      const incomeCat = getUserCategory(db, owner.user.id, "income");

      // Editor cannot create recurring rule on owner's wallet -> 403
      await expectAppError(
        () =>
          createRecurringRule(db, editor.user.id, {
            walletId: wallet.id,
            categoryId: expenseCat.id,
            type: "expense",
            amount: 400_000,
            title: "WiFi",
            frequency: "monthly",
            nextRunDate: "2026-11-15",
          }),
        403
      );

      // Owner creates due rule and future rule
      const dueRule = createRecurringRule(db, owner.user.id, {
        walletId: wallet.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 450_000,
        title: "Tagihan Listrik",
        frequency: "monthly",
        nextRunDate: "2026-11-15",
      });
      const futureRule = createRecurringRule(db, owner.user.id, {
        walletId: wallet.id,
        categoryId: incomeCat.id,
        type: "income",
        amount: 10_000_000,
        title: "Gaji",
        frequency: "monthly",
        nextRunDate: "2026-12-01",
      });

      expect(listRecurringRules(db, owner.user.id)).toHaveLength(2);
      const dueList = listDueRecurringRules(db, owner.user.id, "2026-11-21");
      expect(dueList).toHaveLength(1);
      expect(dueList[0].id).toBe(dueRule.id);

      // Apply with overrideAmount = 500.000
      const postedTx = applyRecurringRule(
        db,
        dueRule.id,
        owner.user.id,
        500_000
      );
      expect(postedTx.amount).toBe(500_000);
      expect(postedTx.occurredAt).toBe("2026-11-15");
      expect(getWalletBalance(db, wallet.id)).toBe(4_500_000);

      // nextRunDate advanced to 2026-12-15
      const updatedAfterApply = listRecurringRules(db, owner.user.id).find(
        (r) => r.id === dueRule.id
      )!;
      expect(updatedAfterApply.nextRunDate).toBe("2026-12-15");

      // Duplicate (recurringRuleId, occurredAt) rejected by partial unique index
      // Simulate resetting nextRunDate back to "2026-11-15" (concurrent double-apply / replay)
      db.update(recurringRules)
        .set({ nextRunDate: "2026-11-15" })
        .where(eq(recurringRules.id, dueRule.id))
        .run();

      await expectAppError(
        () => applyRecurringRule(db, dueRule.id, owner.user.id),
        409
      );
      // Balance must NOT have drifted on rejected duplicate!
      expect(getWalletBalance(db, wallet.id)).toBe(4_500_000);

      // Restore nextRunDate to 2026-12-15 and test skipRecurringRule
      updateRecurringRule(db, dueRule.id, owner.user.id, {
        nextRunDate: "2026-12-15",
      });
      const skipped = skipRecurringRule(db, dueRule.id, owner.user.id);
      expect(skipped.nextRunDate).toBe("2027-01-15");
      expect(getWalletBalance(db, wallet.id)).toBe(4_500_000);
      expect(
        db
          .select()
          .from(transactions)
          .where(eq(transactions.recurringRuleId, dueRule.id))
          .all()
      ).toHaveLength(1);

      // Deleting a rule that already posted transactions succeeds cleanly without FK crash
      // while preserving the posted transaction
      deleteRecurringRule(db, dueRule.id, owner.user.id);
      expect(listRecurringRules(db, owner.user.id)).toHaveLength(1);
      const preservedTx = getTransactionById(db, postedTx.id, owner.user.id);
      expect(preservedTx.amount).toBe(500_000);

      // Clean up futureRule
      deleteRecurringRule(db, futureRule.id, owner.user.id);
    } finally {
      sqlite.close();
    }
  });

  test("API route handlers enforce 401, 400 malformed JSON, Indonesian Zod errors, multipart attachment upload/download, and recurring endpoints", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    const prevUploadDir = process.env.UPLOAD_DIR;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-tx-api-"));
    const uploadDir = path.join(tempDir, "uploads");
    process.env.DATABASE_PATH = path.join(tempDir, "test.db");
    process.env.UPLOAD_DIR = uploadDir;
    mockSessionCookie = undefined;

    function jsonReq(url: string, method: string, body: unknown): Request {
      return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    function badJsonReq(url: string, method: string): Request {
      return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: "{bad-json",
      });
    }

    try {
      const db = getDb();
      const owner = await registerUser(db, {
        name: "Raka",
        email: "raka-api@aruskas.test",
        password: "Password123!",
      });
      const outsider = await registerUser(db, {
        name: "Tamu",
        email: "tamu-api@aruskas.test",
        password: "Password123!",
      });

      // 1. Unauthenticated -> 401 across all 7 route files
      expect(
        (
          await listTransactionsRoute(
            new Request("http://localhost/api/transactions")
          )
        ).status
      ).toBe(401);
      expect(
        (
          await createTransactionRoute(
            jsonReq("http://localhost/api/transactions", "POST", {})
          )
        ).status
      ).toBe(401);
      expect(
        (
          await getTransactionRoute(
            new Request("http://localhost/api/transactions/t1"),
            { params: Promise.resolve({ id: "t1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await updateTransactionRoute(
            jsonReq("http://localhost/api/transactions/t1", "PATCH", {}),
            { params: Promise.resolve({ id: "t1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await deleteTransactionRoute(
            new Request("http://localhost/api/transactions/t1", {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: "t1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await downloadAttachmentRoute(
            new Request("http://localhost/api/attachments/t1"),
            { params: Promise.resolve({ transactionId: "t1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (await listRecurringRoute(new Request("http://localhost/api/recurring")))
          .status
      ).toBe(401);
      expect(
        (
          await createRecurringRoute(
            jsonReq("http://localhost/api/recurring", "POST", {})
          )
        ).status
      ).toBe(401);
      expect(
        (
          await updateRecurringRoute(
            jsonReq("http://localhost/api/recurring/r1", "PATCH", {}),
            { params: Promise.resolve({ id: "r1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await deleteRecurringRoute(
            new Request("http://localhost/api/recurring/r1", {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: "r1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await applyRecurringRoute(
            new Request("http://localhost/api/recurring/r1/apply", {
              method: "POST",
            }),
            { params: Promise.resolve({ id: "r1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await skipRecurringRoute(
            new Request("http://localhost/api/recurring/r1/skip", {
              method: "POST",
            }),
            { params: Promise.resolve({ id: "r1" }) }
          )
        ).status
      ).toBe(401);

      mockSessionCookie = owner.token;

      // Setup wallet & category
      const wallet = createWallet(db, owner.user.id, {
        name: "Dompet Utama Uji",
        type: "cash",
        initialBalance: 1_000_000,
      });
      const expenseCat = getUserCategory(db, owner.user.id, "expense");

      // 2. Malformed JSON -> 400
      expect(
        (
          await createTransactionRoute(
            badJsonReq("http://localhost/api/transactions", "POST")
          )
        ).status
      ).toBe(400);
      expect(
        (
          await updateTransactionRoute(
            badJsonReq("http://localhost/api/transactions/t1", "PATCH"),
            { params: Promise.resolve({ id: "t1" }) }
          )
        ).status
      ).toBe(400);
      expect(
        (
          await createRecurringRoute(
            badJsonReq("http://localhost/api/recurring", "POST")
          )
        ).status
      ).toBe(400);

      // 3. Indonesian Zod errors (no English error leakage)
      const badTypeRes = await createTransactionRoute(
        jsonReq("http://localhost/api/transactions", "POST", {
          walletId: wallet.id,
          categoryId: expenseCat.id,
          type: "refund",
          amount: 10000,
          title: "Uji",
          occurredAt: "2026-11-20",
        })
      );
      expect(badTypeRes.status).toBe(400);
      const badTypeMsg = ((await badTypeRes.json()) as { error: string }).error;
      expect(badTypeMsg).toBe("Tipe transaksi tidak valid.");

      const badFreqRes = await createRecurringRoute(
        jsonReq("http://localhost/api/recurring", "POST", {
          walletId: wallet.id,
          categoryId: expenseCat.id,
          type: "expense",
          amount: 50000,
          title: "Uji Rutin",
          frequency: "daily",
          nextRunDate: "2026-11-20",
        })
      );
      expect(badFreqRes.status).toBe(400);
      expect(((await badFreqRes.json()) as { error: string }).error).toBe(
        "Frekuensi jadwal harus mingguan atau bulanan."
      );

      // 4. Multipart form-data transaction with PNG attachment -> 201
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);
      const formData = new FormData();
      formData.set("walletId", wallet.id);
      formData.set("categoryId", expenseCat.id);
      formData.set("type", "expense");
      formData.set("amount", "75000");
      formData.set("title", "Makan Siang Struk");
      formData.set("occurredAt", "2026-11-20");
      formData.set(
        "attachment",
        new File([pngBytes], "struk-makan.png", { type: "image/png" })
      );

      const multipartRes = await createTransactionRoute(
        new Request("http://localhost/api/transactions", {
          method: "POST",
          body: formData,
        })
      );
      expect(multipartRes.status).toBe(201);
      const multipartJson = (await multipartRes.json()) as {
        transaction: {
          id: string;
          hasAttachment: boolean;
          attachmentName: string | null;
          attachmentMime: string | null;
        };
      };
      expect(multipartJson.transaction.hasAttachment).toBe(true);
      expect(multipartJson.transaction.attachmentName).toBe("struk-makan.png");
      expect(multipartJson.transaction.attachmentMime).toBe("image/png");
      const txId = multipartJson.transaction.id;

      // Download attachment as owner -> 200
      const dlRes = await downloadAttachmentRoute(
        new Request(`http://localhost/api/attachments/${txId}`),
        { params: Promise.resolve({ transactionId: txId }) }
      );
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers.get("content-type")).toBe("image/png");
      expect(dlRes.headers.get("content-disposition")).toContain(
        'inline; filename="struk-makan.png"'
      );
      const dlBuf = new Uint8Array(await dlRes.arrayBuffer());
      expect(Array.from(dlBuf)).toEqual(Array.from(pngBytes));

      // Outsider attempting to download attachment -> 403
      mockSessionCookie = outsider.token;
      const outsiderDlRes = await downloadAttachmentRoute(
        new Request(`http://localhost/api/attachments/${txId}`),
        { params: Promise.resolve({ transactionId: txId }) }
      );
      expect(outsiderDlRes.status).toBe(403);

      // Owner PATCH, GET, DELETE transaction
      mockSessionCookie = owner.token;
      const getRes = await getTransactionRoute(
        new Request(`http://localhost/api/transactions/${txId}`),
        { params: Promise.resolve({ id: txId }) }
      );
      expect(getRes.status).toBe(200);

      const patchRes = await updateTransactionRoute(
        jsonReq(`http://localhost/api/transactions/${txId}`, "PATCH", {
          amount: 80000,
          notes: "Plus parkir",
        }),
        { params: Promise.resolve({ id: txId }) }
      );
      expect(patchRes.status).toBe(200);
      expect(getWalletBalance(db, wallet.id)).toBe(920_000);

      const listRes = await listTransactionsRoute(
        new Request(
          `http://localhost/api/transactions?walletId=${wallet.id}&type=expense`
        )
      );
      expect(listRes.status).toBe(200);
      const listJson = (await listRes.json()) as {
        items: Array<{ id: string }>;
        summary: { expense: number };
      };
      expect(listJson.items).toHaveLength(1);
      expect(listJson.summary.expense).toBe(80_000);

      const delRes = await deleteTransactionRoute(
        new Request(`http://localhost/api/transactions/${txId}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: txId }) }
      );
      expect(delRes.status).toBe(200);
      expect(getWalletBalance(db, wallet.id)).toBe(1_000_000);

      // 5. Recurring routes lifecycle: POST -> apply (no body) -> skip -> PATCH -> DELETE
      const createRuleRes = await createRecurringRoute(
        jsonReq("http://localhost/api/recurring", "POST", {
          walletId: wallet.id,
          categoryId: expenseCat.id,
          type: "expense",
          amount: 100_000,
          title: "Langganan Musik",
          frequency: "monthly",
          nextRunDate: "2026-11-20",
        })
      );
      expect(createRuleRes.status).toBe(201);
      const ruleId = (
        (await createRuleRes.json()) as { rule: { id: string } }
      ).rule.id;

      const applyRes = await applyRecurringRoute(
        new Request(`http://localhost/api/recurring/${ruleId}/apply`, {
          method: "POST",
        }),
        { params: Promise.resolve({ id: ruleId }) }
      );
      expect(applyRes.status).toBe(201);
      expect(getWalletBalance(db, wallet.id)).toBe(900_000);

      const skipRes = await skipRecurringRoute(
        new Request(`http://localhost/api/recurring/${ruleId}/skip`, {
          method: "POST",
        }),
        { params: Promise.resolve({ id: ruleId }) }
      );
      expect(skipRes.status).toBe(200);
      expect(
        ((await skipRes.json()) as { rule: { nextRunDate: string } }).rule
          .nextRunDate
      ).toBe("2027-01-20");

      const patchRuleRes = await updateRecurringRoute(
        jsonReq(`http://localhost/api/recurring/${ruleId}`, "PATCH", {
          amount: 120_000,
        }),
        { params: Promise.resolve({ id: ruleId }) }
      );
      expect(patchRuleRes.status).toBe(200);

      const deleteRuleRes = await deleteRecurringRoute(
        new Request(`http://localhost/api/recurring/${ruleId}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: ruleId }) }
      );
      expect(deleteRuleRes.status).toBe(200);

      // 6. Multipart upload cleanup on RBAC failure + invalid MIME + dueOnly + non-object JSON
      const badMimeForm = new FormData();
      badMimeForm.set("walletId", wallet.id);
      badMimeForm.set("categoryId", expenseCat.id);
      badMimeForm.set("type", "expense");
      badMimeForm.set("amount", "15000");
      badMimeForm.set("title", "File Terlarang");
      badMimeForm.set("occurredAt", "2026-11-20");
      badMimeForm.set(
        "attachment",
        new File([new Uint8Array([1, 2, 3])], "virus.exe", {
          type: "application/x-msdownload",
        })
      );
      const badMimeRes = await createTransactionRoute(
        new Request("http://localhost/api/transactions", {
          method: "POST",
          body: badMimeForm,
        })
      );
      expect(badMimeRes.status).toBe(400);

      // Outsider uploads valid PNG to owner's wallet -> 403 and no orphan file left in uploadDir
      const filesBefore = fs.existsSync(uploadDir)
        ? fs.readdirSync(uploadDir).length
        : 0;
      mockSessionCookie = outsider.token;
      const outsiderForm = new FormData();
      outsiderForm.set("walletId", wallet.id);
      outsiderForm.set("categoryId", expenseCat.id);
      outsiderForm.set("type", "expense");
      outsiderForm.set("amount", "15000");
      outsiderForm.set("title", "Percobaan IDOR");
      outsiderForm.set("occurredAt", "2026-11-20");
      outsiderForm.set(
        "attachment",
        new File([pngBytes], "idor.png", { type: "image/png" })
      );
      const outsiderPostRes = await createTransactionRoute(
        new Request("http://localhost/api/transactions", {
          method: "POST",
          body: outsiderForm,
        })
      );
      expect(outsiderPostRes.status).toBe(403);
      const filesAfter = fs.existsSync(uploadDir)
        ? fs.readdirSync(uploadDir).length
        : 0;
      expect(filesAfter).toBe(filesBefore);

      // Non-object JSON & invalid calendar date & dueOnly
      mockSessionCookie = owner.token;
      const arrayBodyRes = await createTransactionRoute(
        jsonReq("http://localhost/api/transactions", "POST", [])
      );
      expect(arrayBodyRes.status).toBe(400);
      expect(((await arrayBodyRes.json()) as { error: string }).error).toBe(
        "Format data permintaan tidak valid."
      );

      const invalidCalendarDateRes = await listTransactionsRoute(
        new Request("http://localhost/api/transactions?from=2026-02-30")
      );
      expect(invalidCalendarDateRes.status).toBe(400);

      const dueOnlyRes = await listRecurringRoute(
        new Request("http://localhost/api/recurring?dueOnly=true")
      );
      expect(dueOnlyRes.status).toBe(200);
    } finally {
      mockSessionCookie = undefined;
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
      if (prevUploadDir === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUploadDir;
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows SQLite lock on temp dir cleanup
      }
    }
  });

  test("seeded demo workspace satisfies owner-category rule and redacts Raka private transfers for Nadia", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const demoOwner = await ensureDemoSeeded(db);
      const partner = db
        .select()
        .from(users)
        .where(eq(users.email, DEMO_PARTNER_EMAIL))
        .get()!;

      const allWallets = db.select().from(wallets).all();
      const walletMap = new Map(allWallets.map((w) => [w.id, w]));
      const allCats = db.select().from(categories).all();
      const catMap = new Map(allCats.map((c) => [c.id, c]));
      const allTx = db.select().from(transactions).all();

      for (const tx of allTx) {
        if (tx.type === "transfer") {
          expect(tx.categoryId).toBeNull();
          continue;
        }
        const wallet = walletMap.get(tx.walletId)!;
        const cat = catMap.get(tx.categoryId!)!;
        expect(cat.userId).toBe(wallet.ownerId);
        expect(cat.type).toBe(tx.type);
      }

      const kasWallet = allWallets.find((w) => w.name === "Kas Rumah Tangga")!;
      const partnerKasTx = listTransactions(db, partner.id, {
        walletId: kasWallet.id,
      });
      const inboundFromPrivate = partnerKasTx.items.find(
        (t) => t.type === "transfer" && t.targetWalletId === kasWallet.id
      );
      expect(inboundFromPrivate).toBeDefined();
      expect(inboundFromPrivate!.walletName).toBe("Dompet Pribadi (Terkunci)");
      expect(inboundFromPrivate!.counterpartyWalletName).toBe(
        "Dompet Pribadi (Terkunci)"
      );
      expect(inboundFromPrivate!.canEdit).toBe(false);

      const ownerList = listTransactions(db, demoOwner.id, {});
      expect(ownerList.summary.count).toBe(allTx.length);
    } finally {
      sqlite.close();
    }
  });
});
