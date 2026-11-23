import { describe, expect, test } from "bun:test";
import { POST as bcaWebhookRoute } from "@/app/api/integrations/bca/webhook/route";
import { createDb, getDb } from "@/db";
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
    expect(
      parseBcaNotification("Promo GoFood! Bayar pakai GoPay cuma Rp 1 hari ini!", {
        subject: "GoPay / Gojek - Promo Spesial",
      })
    ).toBeNull();
    expect(
      parseBcaNotification("Voucher Gojek diskon Rp 1 untuk perjalananmu.", {
        subject: "GoPay / Gojek - Gojek",
      })
    ).toBeNull();
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
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Budi",
        email: "budi@example.com",
        password: "password123",
      });
      const bcaWallet = await createWallet(db, user.id, {
        name: "BCA Pribadi",
        type: "bank",
        initialBalance: 1_000_000,
      });

      // Setup integration -> returns rawToken once
      const setup = await upsertBcaIntegration(db, user.id, {
        walletId: bcaWallet.id,
        isActive: true,
        autoCategorize: true,
      });
      expect(setup.rawToken).toBeTruthy();
      expect(setup.rawToken!.startsWith("bca_live_")).toBe(true);
      expect(setup.integration.walletId).toBe(bcaWallet.id);

      const token = setup.rawToken!;

      // Invalid token rejected with 401
      await expect(
        ingestBcaNotificationByToken(db, "bca_live_invalid", {
          text: "Transfer masuk Rp 100.000 dari AHMAD",
        })
      ).rejects.toThrow(AppError);

      // Valid incoming transfer via webhook
      const res1 = await ingestBcaNotificationByToken(db, token, {
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
      const resDup = await ingestBcaNotificationByToken(db, token, {
        subject: "Transfer Masuk myBCA",
        text: "Anda menerima transfer sebesar Rp 500.000,00 dari RINA pada 21/11/2026 Ref: REF001",
        source: "webhook_email",
      });
      expect(resDup.status).toBe("duplicate");

      // Valid outgoing QRIS expense
      const res2 = await ingestBcaNotificationByToken(db, token, {
        text: "Pembayaran QRIS di KOPI KENANGAN sebesar Rp 45.000,00 pada 21/11/2026 berhasil. Ref: QRIS02",
        source: "webhook_push",
      });
      expect(res2.status).toBe("imported");

      // Check exact wallet balance: 1_000_000 + 500_000 - 45_000 = 1_455_000
      const updatedWallet = (await listUserWallets(db, user.id)).find(
        (w) => w.id === bcaWallet.id
      )!;
      expect(updatedWallet.balance).toBe(1_455_000);

      // Rotate token -> old token fails (401), new token works
      const rotated = await rotateBcaWebhookToken(db, user.id);
      expect(rotated.rawToken).not.toBe(token);
      await expect(
        ingestBcaNotificationByToken(db, token, {
          text: "Transfer masuk Rp 50.000 dari TEST Ref: OLD01",
        })
      ).rejects.toThrow(AppError);

      // Pause integration -> webhook returns 403
      await upsertBcaIntegration(db, user.id, {
        walletId: bcaWallet.id,
        isActive: false,
      });
      try {
        await ingestBcaNotificationByToken(db, rotated.rawToken, {
          text: "Transfer masuk Rp 50.000 dari TEST Ref: PAUSE01",
        });
        throw new Error("Should have thrown 403");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).status).toBe(403);
      }

      // Verify sync logs recorded cleanly
      const { logs } = await getBcaIntegration(db, user.id);
      expect(logs.length).toBe(3);
    } finally {
      await close();
    }
  });

  test("simulator and CSV preview/commit enforce anti-duplicate and reconcile balances", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Siti",
        email: "siti@example.com",
        password: "password123",
      });
      const bcaWallet = await createWallet(db, user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 500_000,
      });

      // Simulator preview (does not commit)
      const simPreview = await simulateBcaNotification(db, user.id, {
        walletId: bcaWallet.id,
        text: "Pembayaran Virtual Account TOKOPEDIA sebesar Rp 120.000 pada 20/11/2026 berhasil Ref: VA777",
        commit: false,
      });
      expect(simPreview.parsed.amount).toBe(120_000);
      expect(simPreview.result).toBeUndefined();

      // Simulator commit
      const simCommit = await simulateBcaNotification(db, user.id, {
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

      const preview1 = await previewBcaCsvImport(db, user.id, {
        walletId: bcaWallet.id,
        csvText,
      });
      expect(preview1.rows.length).toBe(2);
      expect(preview1.rows.every((r) => !r.isDuplicate)).toBe(true);

      const userCats = await listCategories(db, user.id);
      const commit1 = await commitBcaCsvImport(db, user.id, {
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
      const preview2 = await previewBcaCsvImport(db, user.id, {
        walletId: bcaWallet.id,
        csvText,
      });
      expect(preview2.rows.every((r) => r.isDuplicate)).toBe(true);

      // Final balance: 500_000 - 120_000 + 2_000_000 - 65_000 = 2_315_000
      const w = (await listUserWallets(db, user.id)).find(
        (x) => x.id === bcaWallet.id
      )!;
      expect(w.balance).toBe(2_315_000);
      const txs = await listTransactions(db, user.id, { walletId: bcaWallet.id });
      expect(txs.items.length).toBe(3);
    } finally {
      await close();
    }
  });

  test("webhook route handles MacroDroid text/plain, multi-line unescaped JSON, form-urlencoded, and logs unexpanded [not_body]", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = `memory://macrodroid-webhook-${crypto.randomUUID()}`;
    try {
      const db = await getDb();
      const { user } = await registerUser(db, {
        name: "Andi",
        email: "andi-macro@aruskas.test",
        password: "Password123!",
      });
      const bca = await createWallet(db, user.id, {
        name: "BCA MacroDroid",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const setup = await upsertBcaIntegration(db, user.id, {
        walletId: bca.id,
        isActive: true,
        autoCategorize: true,
      });
      const token = setup.rawToken!;

      // 1. MacroDroid text/plain body with raw token in Authorization header
      const plainRes = await bcaWebhookRoute(
        new Request("http://localhost/api/integrations/bca/webhook", {
          method: "POST",
          headers: {
            "content-type": "text/plain; charset=utf-8",
            authorization: token,
          },
          body: "Notifikasi Transfer Masuk myBCA - Anda menerima transfer sebesar Rp 250.000 dari SITI pada 22/11/2026 Ref: MD01",
        })
      );
      expect(plainRes.status).toBe(201);

      // 2. MacroDroid JSON body containing raw unescaped newline inside notification text
      const multilineJsonRes = await bcaWebhookRoute(
        new Request("http://localhost/api/integrations/bca/webhook", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-aruskas-token": token,
          },
          body: `{"text":"Pembayaran QRIS berhasil\nKOPI KENANGAN sebesar Rp 35.000 pada 22/11/2026 Ref: MD02","subject":"myBCA","source":"webhook_push"}`,
        })
      );
      expect(multilineJsonRes.status).toBe(201);

      // 3. Form-urlencoded payload
      const formRes = await bcaWebhookRoute(
        new Request("http://localhost/api/integrations/bca/webhook", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Bearer ${token}`,
          },
          body: new URLSearchParams({
            subject: "Livin' Mandiri",
            text: "Pembayaran QRIS Livin' by Mandiri di ALFAMART sebesar Rp 40.000 pada 22/11/2026 berhasil Ref: MD03",
          }).toString(),
        })
      );
      expect(formRes.status).toBe(201);

      // 4. Unexpanded [not_body] placeholder returns 422 AND writes a diagnostic failed log
      const badPlaceholderRes = await bcaWebhookRoute(
        new Request("http://localhost/api/integrations/bca/webhook", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: `{"text":"[not_body]","subject":"[not_title]","source":"webhook_push"}`,
        })
      );
      expect(badPlaceholderRes.status).toBe(422);

      const { logs } = await getBcaIntegration(db, user.id);
      expect(logs.length).toBe(4);
      const failedLog = logs.find((l) => l.status === "failed");
      expect(failedLog?.errorMessage).toContain("[notification]");
    } finally {
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
    }
  });

  test("deduplicates sibling bank app notifications (myBCA + BCA mobile, concurrent & push+email) while allowing genuinely distinct Ref IDs or recipients", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Raka",
        email: "raka-dedupe@aruskas.test",
        password: "Password123!",
      });
      const bcaWallet = await createWallet(db, user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const gopayWallet = await createWallet(db, user.id, {
        name: "GoPay",
        type: "ewallet",
        initialBalance: 200_000,
      });

      const setup = await upsertBcaIntegration(db, user.id, {
        walletId: bcaWallet.id,
        isActive: true,
        autoCategorize: true,
        providerWalletMap: {
          bca: bcaWallet.id,
          gopay: gopayWallet.id,
        },
      });
      const token = setup.rawToken!;

      // 1. Exact reported bug: Rp 17.000 transaction triggers BOTH myBCA & BCA mobile with different wording and different Android externalIds
      const myBcaRes = await ingestBcaNotificationByToken(db, token, {
        subject: "myBCA - Transaksi Berhasil",
        text: "Pembayaran QRIS di WARUNG MAKAN BU ANI sebesar Rp 17.000,00 pada 23/11/2026 berhasil.",
        source: "webhook_push",
        externalId: "and_mybca_17k_001",
      });
      expect(myBcaRes.status).toBe("imported");

      const bcaMobileRes = await ingestBcaNotificationByToken(db, token, {
        subject: "BCA mobile - m-BCA",
        text: "Transaksi QRIS BCA sebesar IDR 17,000.00 pada 23/11/2026 telah berhasil diproses.",
        source: "webhook_push",
        externalId: "and_bcamobile_17k_002",
      });
      expect(bcaMobileRes.status).toBe("duplicate");

      // 2. Email alert arriving for the same Rp 17.000 transaction is also deduplicated
      const emailRes = await ingestBcaNotificationByToken(db, token, {
        subject: "Notifikasi Transaksi BCA",
        text: "Pembayaran QRIS sebesar Rp 17.000,00 pada 23/11/2026 berhasil.",
        source: "webhook_email",
      });
      expect(emailRes.status).toBe("duplicate");

      // 3. Simultaneous race condition (Promise.all): myBCA + BCA mobile hit server at the exact same instant for Rp 25.000
      const [race1, race2] = await Promise.all([
        ingestBcaNotificationByToken(db, token, {
          subject: "myBCA - Transaksi Berhasil",
          text: "Top Up GoPay sebesar Rp 25.000,00 pada 23/11/2026 berhasil.",
          source: "webhook_push",
          externalId: "and_race_mybca_25k",
        }),
        ingestBcaNotificationByToken(db, token, {
          subject: "BCA mobile - m-BCA",
          text: "Pembayaran BCA Virtual Account 7000108123 sebesar IDR 25,000.00 pada 23/11/2026 berhasil.",
          source: "webhook_push",
          externalId: "and_race_mbca_25k",
        }),
      ]);
      const raceStatuses = [race1.status, race2.status].sort();
      expect(raceStatuses).toEqual(["duplicate", "imported"]);

      // Both Top Up GoPay from myBCA & BCA VA must route to BCA wallet (not GoPay!)
      const gopayAfter = (await listUserWallets(db, user.id)).find(
        (w) => w.id === gopayWallet.id
      )!;
      expect(gopayAfter.balance).toBe(200_000);

      // 4. Same Ref ID across different externalIds always deduplicates
      const sameRef1 = await ingestBcaNotificationByToken(db, token, {
        subject: "myBCA",
        text: "Pembayaran QRIS di ALFAMART Rp 30.000 pada 23/11/2026 No. Ref: BCA998877",
        source: "webhook_push",
        externalId: "and_ref_a",
      });
      const sameRef2 = await ingestBcaNotificationByToken(db, token, {
        subject: "BCA mobile",
        text: "Pembayaran berhasil Rp 30.000 pada 23/11/2026 Ref: bca998877",
        source: "webhook_push",
        externalId: "and_ref_b",
      });
      expect(sameRef1.status).toBe("imported");
      expect(sameRef2.status).toBe("duplicate");

      // 5. Two genuinely distinct transactions with DIFFERENT explicit Ref IDs are BOTH recorded
      const distinctRef1 = await ingestBcaNotificationByToken(db, token, {
        subject: "myBCA",
        text: "Pembayaran QRIS di INDOMARET Rp 12.000 pada 23/11/2026 Ref: TRX11111",
        source: "webhook_push",
        externalId: "and_dist_1",
      });
      const distinctRef2 = await ingestBcaNotificationByToken(db, token, {
        subject: "myBCA",
        text: "Pembayaran QRIS di INDOMARET Rp 12.000 pada 23/11/2026 Ref: TRX22222",
        source: "webhook_push",
        externalId: "and_dist_2",
      });
      expect(distinctRef1.status).toBe("imported");
      expect(distinctRef2.status).toBe("imported");

      // 6. Two genuinely distinct transfers from the SAME app to two different recipients without Ref are BOTH recorded
      const diffRecip1 = await ingestBcaNotificationByToken(db, token, {
        subject: "myBCA",
        text: "Transfer ke BUDI SANTOSO sebesar Rp 50.000 pada 23/11/2026 berhasil.",
        source: "webhook_push",
        externalId: "and_recip_1",
      });
      const diffRecip2 = await ingestBcaNotificationByToken(db, token, {
        subject: "myBCA",
        text: "Transfer ke SITI RAHMA sebesar Rp 50.000 pada 23/11/2026 berhasil.",
        source: "webhook_push",
        externalId: "and_recip_2",
      });
      expect(diffRecip1.status).toBe("imported");
      expect(diffRecip2.status).toBe("imported");

      // Final exact balance: 1_000_000 - 17_000 - 25_000 - 30_000 - 12_000 - 12_000 - 50_000 - 50_000 = 804_000
      const bcaAfter = (await listUserWallets(db, user.id)).find(
        (w) => w.id === bcaWallet.id
      )!;
      expect(bcaAfter.balance).toBe(804_000);
    } finally {
      await close();
    }
  });
});
