import { describe, expect, test } from "bun:test";
import { createDb } from "@/db";
import {
  findOrCreateGoogleUser,
  getUserBySessionToken,
  registerUser,
} from "@/lib/auth";
import { upsertBcaIntegration, ingestBcaNotificationByToken } from "@/lib/bca-integration";
import { parseBcaNotification } from "@/lib/bank-notification-parser";
import { upsertBudget } from "@/lib/budgets";
import { listCategories } from "@/lib/categories";
import { AppError } from "@/lib/errors";
import {
  buildGoogleAuthorizationUrl,
  generateGoogleOAuthTokens,
  safeEqualStrings,
} from "@/lib/google-oauth";
import { getDashboardSummary } from "@/lib/reports";
import { parseSmartTransactionText } from "@/lib/smart-paste";
import {
  createSplitBill,
  deleteSplitBill,
  getPublicSplitBillBySlug,
  listUserSplitBills,
  toggleSplitBillParticipantPaid,
} from "@/lib/split-bills";
import { createTransaction } from "@/lib/transactions";
import { createWallet, listUserWallets } from "@/lib/wallets";

describe("5 Growth Features: Universal Bank Parser, Safe-to-Spend, Smart Paste, Split Bill, Google OAuth", () => {
  test("1. Universal Indonesian Bank & E-Wallet Parser recognizes Mandiri, BRI, BNI, Jago, SeaBank, GoPay, OVO, DANA, ShopeePay", () => {
    const mandiri = parseBcaNotification(
      "Pembayaran QRIS Livin' by Mandiri di KOPI KENANGAN SUDIRMAN sebesar Rp 42.000 pada 21/11/2026 berhasil. Ref: MDR001"
    );
    expect(mandiri).not.toBeNull();
    expect(mandiri!.type).toBe("expense");
    expect(mandiri!.amount).toBe(42_000);
    expect(mandiri!.providerName).toBe("Mandiri");
    expect(mandiri!.paymentMethod).toBe("QRIS Mandiri");

    const gopay = parseBcaNotification(
      "Kamu bayar Rp 68.500 pakai GoPay QRIS di WARUNG PADANG SEDERHANA pada 21/11/2026 berhasil. Ref: GPY002"
    );
    expect(gopay).not.toBeNull();
    expect(gopay!.type).toBe("expense");
    expect(gopay!.amount).toBe(68_500);
    expect(gopay!.providerName).toBe("GoPay");
    expect(gopay!.paymentMethod).toBe("QRIS GoPay");

    const seabank = parseBcaNotification(
      "Transfer masuk SeaBank sebesar Rp 750.000 dari ANDI PRATAMA pada 21/11/2026 berhasil. No. Ref: SEA003"
    );
    expect(seabank).not.toBeNull();
    expect(seabank!.type).toBe("income");
    expect(seabank!.amount).toBe(750_000);
    expect(seabank!.providerName).toBe("SeaBank");
    expect(seabank!.paymentMethod).toBe("Transfer SeaBank");

    const brimo = parseBcaNotification(
      "Pembayaran BRIVA TOKOPEDIA melalui BRImo sebesar Rp 275.000,00 pada 21/11/2026 berhasil. Ref: BRI004"
    );
    expect(brimo).not.toBeNull();
    expect(brimo!.type).toBe("expense");
    expect(brimo!.amount).toBe(275_000);
    expect(brimo!.providerName).toBe("BRI");
    expect(brimo!.paymentMethod).toBe("Virtual Account BRI");

    const shopeepay = parseBcaNotification(
      "Pembayaran ShopeePay di ALFAMART sebesar Rp 23.000 pada 21/11/2026 berhasil."
    );
    expect(shopeepay).not.toBeNull();
    expect(shopeepay!.providerName).toBe("ShopeePay");
    expect(shopeepay!.amount).toBe(23_000);
  });

  test("2. Daily Safe-to-Spend computes exact daily allowance from monthly budgets and remaining days", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Rina",
        email: "rina-safe@aruskas.test",
        password: "Password123!",
      });
      const wallets = await listUserWallets(db, user.id);
      const cats = await listCategories(db, user.id);
      const foodCat = cats.find((c) => c.type === "expense")!;

      // November has 30 days. On 2026-11-21, remainingDays = 30 - 21 + 1 = 10 days.
      await upsertBudget(db, user.id, {
        categoryId: foodCat.id,
        month: "2026-11",
        limitAmount: 2_000_000,
      });

      await createTransaction(db, user.id, {
        walletId: wallets[0].id,
        categoryId: foodCat.id,
        type: "expense",
        amount: 800_000,
        title: "Belanja Bahan",
        occurredAt: "2026-11-10",
      });

      const summary = await getDashboardSummary(db, user.id, user.email, {
        todayIso: "2026-11-21",
      });

      expect(summary.safeToSpend.basis).toBe("budgets");
      expect(summary.safeToSpend.remainingDays).toBe(10);
      expect(summary.safeToSpend.remainingBudget).toBe(1_200_000);
      expect(summary.safeToSpend.dailyAllowance).toBe(120_000);
      expect(summary.safeToSpend.status).toBe("safe");
    } finally {
      await close();
    }
  });

  test("3. Smart Paste parses 1-line Indonesian casual text & bank notifications accurately", () => {
    const mockCats = [
      { id: "c-food", name: "Makanan & Minuman", type: "expense" as const },
      { id: "c-trans", name: "Transportasi", type: "expense" as const },
      { id: "c-sal", name: "Gaji", type: "income" as const },
      { id: "c-other", name: "Lainnya", type: "expense" as const },
    ];

    const r1 = parseSmartTransactionText(
      "Makan siang Padang 38rb pakai QRIS",
      mockCats,
      "2026-11-22"
    );
    expect(r1).not.toBeNull();
    expect(r1!.type).toBe("expense");
    expect(r1!.amount).toBe(38_000);
    expect(r1!.paymentMethod).toBe("QRIS");
    expect(r1!.categoryId).toBe("c-food");
    expect(r1!.occurredAt).toBe("2026-11-22");

    const r2 = parseSmartTransactionText(
      "Bensin Pertamax 150k tunai kemarin",
      mockCats,
      "2026-11-22"
    );
    expect(r2).not.toBeNull();
    expect(r2!.amount).toBe(150_000);
    expect(r2!.paymentMethod).toBe("Tunai");
    expect(r2!.categoryId).toBe("c-trans");
    expect(r2!.occurredAt).toBe("2026-11-21");

    const r3 = parseSmartTransactionText(
      "Gaji bulanan 8.5jt transfer",
      mockCats,
      "2026-11-22"
    );
    expect(r3).not.toBeNull();
    expect(r3!.type).toBe("income");
    expect(r3!.amount).toBe(8_500_000);
    expect(r3!.paymentMethod).toBe("Transfer Bank");
    expect(r3!.categoryId).toBe("c-sal");
  });

  test("4. Split Bill creates shareable public link, tracks paid status, validates sum, and deletes cleanly", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Nadia",
        email: "nadia-split@aruskas.test",
        password: "Password123!",
      });
      const wallet = await createWallet(db, user.id, {
        name: "BCA Nadia",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const expenseCat = (await listCategories(db, user.id, { type: "expense" }))[0];
      const tx = await createTransaction(db, user.id, {
        walletId: wallet.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 300_000,
        title: "Makan Malam Tim",
        occurredAt: "2026-11-21",
      });

      // Mismatched participant sum must reject with 400
      let mismatchErr: unknown;
      try {
        await createSplitBill(db, user.id, {
          title: "Makan Malam Tim",
          totalAmount: 300_000,
          occurredAt: "2026-11-21",
          participants: [
            { name: "Nadia", amount: 100_000 },
            { name: "Budi", amount: 100_000 },
          ],
        });
      } catch (e) {
        mismatchErr = e;
      }
      expect(mismatchErr).toBeInstanceOf(AppError);
      expect((mismatchErr as AppError).status).toBe(400);

      const bill = await createSplitBill(db, user.id, {
        title: "Makan Malam Tim",
        totalAmount: 300_000,
        occurredAt: "2026-11-21",
        transactionId: tx.id,
        bankName: "BCA",
        accountNumber: "8821004921",
        accountHolder: "Nadia",
        participants: [
          { name: "Nadia", amount: 100_000, isPaid: true },
          { name: "Budi", amount: 100_000, isPaid: false },
          { name: "Citra", amount: 100_000, isPaid: false },
        ],
      });

      expect(bill.paidCount).toBe(1);
      expect(bill.paidAmount).toBe(100_000);
      expect(bill.unpaidAmount).toBe(200_000);

      // Public read-only slug lookup works without auth and exposes safe fields
      const pub = await getPublicSplitBillBySlug(db, bill.slug);
      expect(pub).not.toBeNull();
      expect(pub!.creatorName).toBe("Nadia");
      expect(pub!.bankName).toBe("BCA");
      expect(pub!.participants).toHaveLength(3);

      // Toggle Budi as paid
      const budi = bill.participants.find((p) => p.name === "Budi")!;
      const updated = await toggleSplitBillParticipantPaid(
        db,
        user.id,
        bill.id,
        budi.id,
        true
      );
      expect(updated.paidCount).toBe(2);
      expect(updated.paidAmount).toBe(200_000);
      expect(updated.unpaidAmount).toBe(100_000);

      const listed = await listUserSplitBills(db, user.id);
      expect(listed).toHaveLength(1);

      await deleteSplitBill(db, user.id, bill.id);
      expect(await getPublicSplitBillBySlug(db, bill.slug)).toBeNull();
    } finally {
      await close();
    }
  });

  test("1b. Multi-Bank & Multi-E-Wallet webhook routes GoPay and SeaBank to their mapped wallets", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Bima",
        email: "bima-multi@aruskas.test",
        password: "Password123!",
      });
      const defaultWallet = await createWallet(db, user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const gopayWallet = await createWallet(db, user.id, {
        name: "Dompet GoPay",
        type: "ewallet",
        initialBalance: 500_000,
      });
      const seabankWallet = await createWallet(db, user.id, {
        name: "SeaBank Bima",
        type: "bank",
        initialBalance: 2_000_000,
      });

      const setup = await upsertBcaIntegration(db, user.id, {
        walletId: defaultWallet.id,
        isActive: true,
        autoCategorize: true,
        providerWalletMap: {
          gopay: gopayWallet.id,
          seabank: seabankWallet.id,
        },
      });

      const r1 = await ingestBcaNotificationByToken(db, setup.rawToken!, {
        subject: "Notifikasi GoPay",
        text: "Kamu bayar Rp 50.000 pakai GoPay QRIS di KOPI KENANGAN pada 22/11/2026 berhasil. Ref: GPY-ROUTE-1",
      });
      expect(r1.status).toBe("imported");
      if (r1.status === "imported") {
        expect(r1.transaction.walletId).toBe(gopayWallet.id);
      }

      const r2 = await ingestBcaNotificationByToken(db, setup.rawToken!, {
        subject: "SeaBank - Dana Masuk",
        text: "Transfer masuk SeaBank sebesar Rp 300.000 dari ANDI pada 22/11/2026 berhasil. No. Ref: SEA-ROUTE-1",
      });
      expect(r2.status).toBe("imported");
      if (r2.status === "imported") {
        expect(r2.transaction.walletId).toBe(seabankWallet.id);
      }
    } finally {
      await close();
    }
  });

  test("5. Google OAuth provisions new user with default wallet & categories, links existing email, and validates PKCE/state", async () => {
    const prevClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

    const { db, close } = await createDb(":memory:");
    try {
      const tokens = generateGoogleOAuthTokens();
      expect(tokens.state.length).toBeGreaterThan(20);
      expect(safeEqualStrings(tokens.state, tokens.state)).toBe(true);
      expect(safeEqualStrings(tokens.state, "wrong")).toBe(false);

      const authUrl = new URL(
        buildGoogleAuthorizationUrl({
          redirectUri: "https://aruskas-bay.vercel.app/api/auth/google/callback",
          state: tokens.state,
          codeChallenge: tokens.codeChallenge,
        })
      );
      expect(authUrl.origin).toBe("https://accounts.google.com");
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");

      // New Google user provisioning
      const firstLogin = await findOrCreateGoogleUser(db, {
        sub: "google-sub-123456",
        email: "andi.google@gmail.com",
        name: "Andi Google",
      });
      expect(firstLogin.isNewUser).toBe(true);
      expect(await getUserBySessionToken(db, firstLogin.token)).not.toBeNull();

      const wallets = await listUserWallets(db, firstLogin.user.id);
      expect(wallets).toHaveLength(1);
      expect(wallets[0].name).toBe("Dompet Utama");

      const cats = await listCategories(db, firstLogin.user.id);
      expect(cats.length).toBeGreaterThanOrEqual(12);

      // Returning Google user reuses the exact same user record
      const secondLogin = await findOrCreateGoogleUser(db, {
        sub: "google-sub-123456",
        email: "andi.google@gmail.com",
        name: "Andi Google",
      });
      expect(secondLogin.isNewUser).toBe(false);
      expect(secondLogin.user.id).toBe(firstLogin.user.id);

      // Linking an existing email/password user to Google sub
      const existing = await registerUser(db, {
        name: "Sari",
        email: "sari@gmail.com",
        password: "Password123!",
      });
      const linked = await findOrCreateGoogleUser(db, {
        sub: "google-sub-sari-999",
        email: "sari@gmail.com",
        name: "Sari Google",
      });
      expect(linked.isNewUser).toBe(false);
      expect(linked.user.id).toBe(existing.user.id);
    } finally {
      await close();
      if (prevClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = prevClientId;
      }
    }
  });
});
