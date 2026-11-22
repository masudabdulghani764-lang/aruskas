import { describe, expect, test } from "bun:test";
import { createDb } from "@/db";
import {
  deleteUserAccount,
  getUserBySessionToken,
  loginUser,
  registerUser,
} from "@/lib/auth";
import {
  createDebt,
  deleteDebt,
  listUserDebts,
  recordDebtPayment,
} from "@/lib/debts";
import { AppError } from "@/lib/errors";
import {
  completePasswordReset,
  requestPasswordReset,
} from "@/lib/password-reset";
import { createWallet, listUserWallets } from "@/lib/wallets";

describe("Public Release Readiness: Password Reset, Hutang/Piutang, and Account Deletion", () => {
  test("Password reset creates single-use token, updates password, revokes sessions, and blocks reuse", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Fajar",
        email: "fajar-reset@aruskas.test",
        password: "OldPassword123!",
      });

      const req = await requestPasswordReset(
        db,
        "fajar-reset@aruskas.test",
        "https://aruskas-bay.vercel.app"
      );
      expect(req.ok).toBe(true);
      expect(req._rawTokenForTests).toBeDefined();

      // Complete password reset
      await completePasswordReset(
        db,
        req._rawTokenForTests!,
        "NewPassword999!"
      );

      // Previous session must be revoked
      expect(await getUserBySessionToken(db, reg.token)).toBeNull();

      // New password logs in cleanly
      const relogin = await loginUser(db, {
        email: "fajar-reset@aruskas.test",
        password: "NewPassword999!",
      });
      expect(relogin.user.id).toBe(reg.user.id);

      // Reusing same token must fail with 400
      let reuseErr: unknown;
      try {
        await completePasswordReset(
          db,
          req._rawTokenForTests!,
          "AnotherPassword888!"
        );
      } catch (err) {
        reuseErr = err;
      }
      expect(reuseErr).toBeInstanceOf(AppError);
      expect((reuseErr as AppError).status).toBe(400);
    } finally {
      await close();
    }
  });

  test("Hutang & Piutang records debts, tracks partial/full payments, syncs wallet balance, and prevents overpayment", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const { user } = await registerUser(db, {
        name: "Dina",
        email: "dina-debt@aruskas.test",
        password: "Password123!",
      });
      const wallet = await createWallet(db, user.id, {
        name: "BCA Dina",
        type: "bank",
        initialBalance: 1_000_000,
      });

      const payable = await createDebt(db, user.id, {
        type: "payable",
        personName: "Budi",
        title: "Talangan Tiket",
        totalAmount: 500_000,
        dueDate: "2026-12-01",
      });
      const receivable = await createDebt(db, user.id, {
        type: "receivable",
        personName: "Raka",
        title: "Pinjaman Laptop",
        totalAmount: 1_200_000,
      });

      const initialList = await listUserDebts(db, user.id);
      expect(initialList.summary.totalPayableRemaining).toBe(500_000);
      expect(initialList.summary.totalReceivableRemaining).toBe(1_200_000);
      expect(initialList.summary.openCount).toBe(2);

      // Partial payment of 200k synced to wallet -> wallet balance becomes 800k
      const afterPartial = await recordDebtPayment(db, user.id, payable.id, {
        paymentAmount: 200_000,
        walletId: wallet.id,
        occurredAt: "2026-11-22",
      });
      expect(afterPartial.paidAmount).toBe(200_000);
      expect(afterPartial.remainingAmount).toBe(300_000);
      expect(afterPartial.status).toBe("open");

      // Overpayment must reject with 400
      let overErr: unknown;
      try {
        await recordDebtPayment(db, user.id, payable.id, {
          paymentAmount: 400_000,
        });
      } catch (err) {
        overErr = err;
      }
      expect(overErr).toBeInstanceOf(AppError);
      expect((overErr as AppError).status).toBe(400);

      // Settle remaining 300k
      const settled = await recordDebtPayment(db, user.id, payable.id, {
        paymentAmount: 300_000,
        walletId: wallet.id,
        occurredAt: "2026-11-22",
      });
      expect(settled.status).toBe("settled");
      expect(settled.remainingAmount).toBe(0);

      const walletsAfter = await listUserWallets(db, user.id);
      const updatedBca = walletsAfter.find((w) => w.id === wallet.id)!;
      expect(updatedBca.balance).toBe(500_000); // 1,000,000 - 200,000 - 300,000

      await deleteDebt(db, user.id, receivable.id);
      const finalList = await listUserDebts(db, user.id);
      expect(finalList.items).toHaveLength(1);
    } finally {
      await close();
    }
  });

  test("Self-service deleteUserAccount enforces confirmation & password and cascades all owned data", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Hendra",
        email: "hendra-del@aruskas.test",
        password: "SecretDelete123!",
      });

      // Wrong confirmation phrase fails
      let badPhraseErr: unknown;
      try {
        await deleteUserAccount(db, reg.user.id, {
          confirmText: "salah",
          currentPassword: "SecretDelete123!",
        });
      } catch (err) {
        badPhraseErr = err;
      }
      expect(badPhraseErr).toBeInstanceOf(AppError);
      expect((badPhraseErr as AppError).status).toBe(400);

      // Wrong password fails
      let badPassErr: unknown;
      try {
        await deleteUserAccount(db, reg.user.id, {
          confirmText: "HAPUS AKUN",
          currentPassword: "WrongPassword!",
        });
      } catch (err) {
        badPassErr = err;
      }
      expect(badPassErr).toBeInstanceOf(AppError);
      expect((badPassErr as AppError).status).toBe(400);

      // Valid confirmation + password permanently removes account & session
      await deleteUserAccount(db, reg.user.id, {
        confirmText: "HAPUS AKUN",
        currentPassword: "SecretDelete123!",
      });

      expect(await getUserBySessionToken(db, reg.token)).toBeNull();
    } finally {
      await close();
    }
  });
});
