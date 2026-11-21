import { describe, expect, test } from "bun:test";
import { createDb } from "@/db";
import { registerUser } from "@/lib/auth";
import {
  commitBcaCsvImport,
  getBcaIntegration,
  ingestBcaNotificationByToken,
  previewBcaCsvImport,
  rotateBcaWebhookToken,
  simulateBcaNotification,
  upsertBcaIntegration,
} from "@/lib/bca-integration";
import {
  parseBcaAmount,
  parseBcaCsv,
  parseBcaNotification,
  suggestBcaCategoryId,
} from "@/lib/bca-parser";
import { listCategories } from "@/lib/categories";
import { AppError } from "@/lib/errors";
import { listTransactions } from "@/lib/transactions";
import { createWallet, listUserWallets } from "@/lib/wallets";

describe("BCA Notification & CSV Parser", () => {
  test("parseBcaAmount handles Indonesian and KlikBCA English formats cleanly", () => {
    expect(parseBcaAmount("Rp 1.250.000,00")).toBe(1_250_000);
    expect(parseBcaAmount("IDR 2,500,000.00")).toBe(2_500_000);
    expect(parseBcaAmount("Rp38.000")).toBe(38_000);
    expect(parseBcaAmount("45,000.00")).toBe(45_000);
    expect(parseBcaAmount("0")).toBeNull();
    expect(parseBcaAmount("abc")).toBeNull();
  });

  test("parseBcaNotification parses real Indonesian myBCA/m-BCA incoming and outgoing notifications", () => {
    const incoming = parseBcaNotification(
      "Anda menerima transfer sebesar Rp 2.500.000,00 dari BUDI SANTOSO pada tanggal 21/11/2026 No. Ref: BCA991122",
      { subject: "Notifikasi Transfer Masuk myBCA" }
    );
    expect(incoming).not.toBeNull();
    expect(incoming!.type).toBe("income");
    expect(incoming!.amount).toBe(2_500_000);
    expect(incoming!.occurredAt).toBe("2026-11-21");
    expect(incoming!.title).toContain("BUDI SANTOSO");

    const qris = parseBcaNotification(
      "Pembayaran QRIS di KOPI KENANGAN sebesar Rp 38.000,00 pada 20/11/2026 berhasil. Ref: QRIS8821",
      { subject: "Transaksi QRIS Berhasil" }
    );
    expect(qris).not.toBeNull();
    expect(qris!.type).toBe("expense");
    expect(qris!.amount).toBe(38_000);
    expect(qris!.paymentMethod).toBe("QRIS BCA");
    expect(qris!.title).toContain("KOPI KENANGAN");

    const va = parseBcaNotification(
      "Pembayaran Virtual Account TOKOPEDIA sebesar IDR 245,500.00 pada 19-11-2026 berhasil.",
      { subject: "BCA Virtual Account" }
    );
    expect(va).not.toBeNull();
    expect(va!.type).toBe("expense");
    expect(va!.amount).toBe(245_500);
    expect(va!.paymentMethod).toBe("Virtual Account BCA");
    expect(va!.title).toContain("TOKOPEDIA");

    expect(parseBcaNotification("Halo, ini hanya promo kartu kredit BCA.")).toBeNull();
  });

  test("parseBcaCsv parses KlikBCA statement with metadata headers, CR/DB, PEND skipping, and footer", () => {
    const sampleCsv = [
      "Informasi Rekening",
      "No. Rekening,=,1234567890",
      "Nama,=,BUDI PRATAMA",
      "Periode,=,01/11/2026 - 30/11/2026",
      "",
      "Tanggal,Keterangan,Cabang,Jumlah,Saldo",
      "'01/11,TRSF E-BANKING CR 11/01 PT NUSANTARA GAJI,0000,\"14,500,000.00 CR\",\"24,500,000.00\"",
      "'05/11,QR 004 KOPI KENANGAN GRAND INDONESIA,0000,\"42,000.00 DB\",\"24,458,000.00\"",
      "'10/11,TRSF E-BANKING DB TOKOPEDIA BELANJA,0000,\"315,000.00 DB\",\"24,143,000.00\"",
      "'PEND,QR 004 PENDING MERCHANT,0000,\"25,000.00 DB\",\"24,118,000.00\"",
      "Saldo Awal,=,10,000,000.00",
      "Mutasi Kredit,=,14,500,000.00",
    ].join("\n");

    const parsed = parseBcaCsv(sampleCsv);
    expect(parsed.detectedPeriod).toContain("2026");
    expect(parsed.skippedPending).toBe(1);
    expect(parsed.entries.length).toBe(3);

    expect(parsed.entries[0].type).toBe("income");
    expect(parsed.entries[0].amount).toBe(14_500_000);
    expect(parsed.entries[0].occurredAt).toBe("2026-11-01");

    expect(parsed.entries[1].type).toBe("expense");
    expect(parsed.entries[1].amount).toBe(42_000);
    expect(parsed.entries[1].paymentMethod).toBe("QRIS BCA");

    expect(parsed.entries[2].type).toBe("expense");
    expect(parsed.entries[2].amount).toBe(315_000);
  });

  test("suggestBcaCategoryId maps common Indonesian merchants accurately", () => {
    const cats = [
      { id: "c-gaji", name: "Gaji", type: "income" as const },
      { id: "c-lain-in", name: "Pemasukan Lainnya", type: "income" as const },
      { id: "c-makan", name: "Makanan & Minuman", type: "expense" as const },
      { id: "c-tagihan", name: "Tagihan & Utilitas", type: "expense" as const },
      { id: "c-belanja", name: "Belanja Rumah Tangga", type: "expense" as const },
    ];
    expect(suggestBcaCategoryId(cats, "expense", "QRIS · KOPI KENANGAN")).toBe("c-makan");
    expect(suggestBcaCategoryId(cats, "expense", "VA · PLN LISTRIK PRABAYAR")).toBe("c-tagihan");
    expect(suggestBcaCategoryId(cats, "expense", "VA · TOKOPEDIA")).toBe("c-belanja");
    expect(suggestBcaCategoryId(cats, "income", "Transfer Masuk · PT MAJU GAJI")).toBe("c-gaji");
  });
});

describe("BCA Webhook Auto-Record & CSV Import Service", () => {
  test("webhook authenticates via secret token, atomically updates BCA wallet balance, deduplicates, and supports rotation", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Budi",
        email: "budi@example.com",
        password: "password123",
      });
      const bcaWallet = createWallet(db, user.id, {
        name: "BCA Pribadi",
        type: "bank",
        initialBalance: 1_000_000,
      });

      // Setup integration -> returns rawToken once
      const setup = upsertBcaIntegration(db, user.id, {
        walletId: bcaWallet.id,
        isActive: true,
        autoCategorize: true,
      });
      expect(setup.rawToken).toBeTruthy();
      expect(setup.rawToken!.startsWith("bca_live_")).toBe(true);
      expect(setup.integration.walletId).toBe(bcaWallet.id);

      const token = setup.rawToken!;

      // Invalid token rejected with 401
      expect(() =>
        ingestBcaNotificationByToken(db, "bca_live_invalid", {
          text: "Transfer masuk Rp 100.000 dari AHMAD",
        })
      ).toThrow(AppError);

      // Valid incoming transfer via webhook
      const res1 = ingestBcaNotificationByToken(db, token, {
        subject: "Transfer Masuk myBCA",
        text: "Anda menerima transfer sebesar Rp 500.000,00 dari RINA pada 21/11/2026 Ref: REF001",
        source: "webhook_email",
      });
      expect(res1.status).toBe("imported");
      if (res1.status === "imported") {
        expect(res1.transaction.amount).toBe(500_000);
        expect(res1.transaction.type).toBe("income");
      }

      // Duplicate webhook delivery -> returns duplicate without mutating balance twice
      const resDup = ingestBcaNotificationByToken(db, token, {
        subject: "Transfer Masuk myBCA",
        text: "Anda menerima transfer sebesar Rp 500.000,00 dari RINA pada 21/11/2026 Ref: REF001",
        source: "webhook_email",
      });
      expect(resDup.status).toBe("duplicate");

      // Valid outgoing QRIS expense
      const res2 = ingestBcaNotificationByToken(db, token, {
        text: "Pembayaran QRIS di KOPI KENANGAN sebesar Rp 45.000,00 pada 21/11/2026 berhasil. Ref: QRIS02",
        source: "webhook_push",
      });
      expect(res2.status).toBe("imported");

      // Check exact wallet balance: 1_000_000 + 500_000 - 45_000 = 1_455_000
      const updatedWallet = listUserWallets(db, user.id).find(
        (w) => w.id === bcaWallet.id
      )!;
      expect(updatedWallet.balance).toBe(1_455_000);

      // Rotate token -> old token fails (401), new token works
      const rotated = rotateBcaWebhookToken(db, user.id);
      expect(rotated.rawToken).not.toBe(token);
      expect(() =>
        ingestBcaNotificationByToken(db, token, {
          text: "Transfer masuk Rp 50.000 dari TEST Ref: OLD01",
        })
      ).toThrow(AppError);

      // Pause integration -> webhook returns 403
      upsertBcaIntegration(db, user.id, {
        walletId: bcaWallet.id,
        isActive: false,
      });
      try {
        ingestBcaNotificationByToken(db, rotated.rawToken, {
          text: "Transfer masuk Rp 50.000 dari TEST Ref: PAUSE01",
        });
        throw new Error("Should have thrown 403");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).status).toBe(403);
      }

      // Verify sync logs recorded cleanly
      const { logs } = getBcaIntegration(db, user.id);
      expect(logs.length).toBe(3);
    } finally {
      sqlite.close();
    }
  });

  test("simulator and CSV preview/commit enforce anti-duplicate and reconcile balances", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Siti",
        email: "siti@example.com",
        password: "password123",
      });
      const bcaWallet = createWallet(db, user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 500_000,
      });

      // Simulator preview (does not commit)
      const simPreview = simulateBcaNotification(db, user.id, {
        walletId: bcaWallet.id,
        text: "Pembayaran Virtual Account TOKOPEDIA sebesar Rp 120.000 pada 20/11/2026 berhasil Ref: VA777",
        commit: false,
      });
      expect(simPreview.parsed.amount).toBe(120_000);
      expect(simPreview.result).toBeUndefined();

      // Simulator commit
      const simCommit = simulateBcaNotification(db, user.id, {
        walletId: bcaWallet.id,
        text: "Pembayaran Virtual Account TOKOPEDIA sebesar Rp 120.000 pada 20/11/2026 berhasil Ref: VA777",
        commit: true,
      });
      expect(simCommit.result?.status).toBe("imported");

      // CSV Preview & Commit
      const csvText = [
        "Periode,=,01/11/2026 - 30/11/2026",
        "Tanggal,Keterangan,Cabang,Jumlah,Saldo",
        "'02/11,TRSF E-BANKING CR CLIENT PROJECT,0000,\"2,000,000.00 CR\",\"2,500,000.00\"",
        "'03/11,QR 004 STARBUCKS COFFEE,0000,\"65,000.00 DB\",\"2,435,000.00\"",
      ].join("\n");

      const preview1 = previewBcaCsvImport(db, user.id, {
        walletId: bcaWallet.id,
        csvText,
      });
      expect(preview1.rows.length).toBe(2);
      expect(preview1.rows.every((r) => !r.isDuplicate)).toBe(true);

      const userCats = listCategories(db, user.id);
      const commit1 = commitBcaCsvImport(db, user.id, {
        walletId: bcaWallet.id,
        rows: preview1.rows.map((r) => ({
          type: r.type,
          amount: r.amount,
          title: r.title,
          occurredAt: r.occurredAt,
          paymentMethod: r.paymentMethod,
          notes: r.notes,
          dedupeKey: r.dedupeKey,
          categoryId: r.suggestedCategoryId || userCats[0].id,
        })),
      });
      expect(commit1.importedCount).toBe(2);
      expect(commit1.duplicateCount).toBe(0);
      expect(commit1.totalIncome).toBe(2_000_000);
      expect(commit1.totalExpense).toBe(65_000);

      // Re-uploading the exact same CSV flags both rows as duplicate!
      const preview2 = previewBcaCsvImport(db, user.id, {
        walletId: bcaWallet.id,
        csvText,
      });
      expect(preview2.rows.every((r) => r.isDuplicate)).toBe(true);

      // Final balance: 500_000 - 120_000 + 2_000_000 - 65_000 = 2_315_000
      const w = listUserWallets(db, user.id).find((x) => x.id === bcaWallet.id)!;
      expect(w.balance).toBe(2_315_000);
      const txs = listTransactions(db, user.id, { walletId: bcaWallet.id });
      expect(txs.items.length).toBe(3);
    } finally {
      sqlite.close();
    }
  });
});
