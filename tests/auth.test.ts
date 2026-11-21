import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "@/db";
import {
  budgets,
  categories,
  recurringRules,
  savingsGoals,
  sessions,
  transactions,
  users,
  walletMembers,
  wallets,
} from "@/db/schema";
import {
  DEMO_EMAIL,
  DEMO_PARTNER_EMAIL,
  changePassword,
  createSession,
  destroySession,
  getUserBySessionToken,
  hashSessionToken,
  loginUser,
  registerUser,
  updateUserProfile,
} from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getCurrentMonthYM, getTodayISO } from "@/lib/format";
import { ensureDemoSeeded, resetDemoData } from "@/lib/seed";

describe("Self-Hosted Auth, Onboarding Defaults & Demo Seeder", () => {
  test("registerUser hashes password, creates session, default wallet, and 12 default categories", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const result = await registerUser(
        db,
        {
          name: "  Andi Wijaya  ",
          email: "  Andi@Example.COM ",
          password: "PasswordRahasia123",
        },
        "BunTest/1.0"
      );

      expect(result.user.name).toBe("Andi Wijaya");
      expect(result.user.email).toBe("andi@example.com");
      expect(result.user.isDemo).toBe(false);
      expect(result.user.monthlySavingsTarget).toBe(0);
      expect("passwordHash" in result.user).toBe(false);

      const dbUser = db
        .select()
        .from(users)
        .where(eq(users.id, result.user.id))
        .get();
      expect(dbUser).toBeDefined();
      expect(dbUser!.passwordHash).not.toBe("PasswordRahasia123");
      expect(dbUser!.passwordHash.startsWith("$argon2id$")).toBe(true);

      const sessionUser = getUserBySessionToken(db, result.token);
      expect(sessionUser).not.toBeNull();
      expect(sessionUser!.id).toBe(result.user.id);
      expect(sessionUser!.email).toBe("andi@example.com");

      const userWallets = db
        .select()
        .from(wallets)
        .where(eq(wallets.ownerId, result.user.id))
        .all();
      expect(userWallets).toHaveLength(1);
      expect(userWallets[0].name).toBe("Dompet Utama");
      expect(userWallets[0].type).toBe("cash");
      expect(userWallets[0].balance).toBe(0);
      expect(userWallets[0].initialBalance).toBe(0);

      const memberships = db
        .select()
        .from(walletMembers)
        .where(eq(walletMembers.userId, result.user.id))
        .all();
      expect(memberships).toHaveLength(1);
      expect(memberships[0].walletId).toBe(userWallets[0].id);
      expect(memberships[0].role).toBe("owner");

      const userCategories = db
        .select()
        .from(categories)
        .where(eq(categories.userId, result.user.id))
        .all();
      expect(userCategories).toHaveLength(12);
      expect(
        userCategories.filter((cat) => cat.type === "income")
      ).toHaveLength(5);
      expect(
        userCategories.filter((cat) => cat.type === "expense")
      ).toHaveLength(7);
      expect(userCategories.every((cat) => cat.isDefault === true)).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  test("registerUser rejects duplicate email (case-insensitive) with AppError 409", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      await registerUser(db, {
        name: "Siti Aminah",
        email: "siti@aruskas.test",
        password: "Password123!",
      });

      let caught: unknown;
      try {
        await registerUser(db, {
          name: "Siti Duplikat",
          email: "SITI@aruskas.test",
          password: "PasswordLain123!",
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).status).toBe(409);
    } finally {
      sqlite.close();
    }
  });

  test("loginUser validates credentials, destroySession invalidates token, and expired sessions are pruned", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Budi Santoso",
        email: "budi@aruskas.test",
        password: "KataSandiValid99",
      });

      let wrongPassErr: unknown;
      try {
        await loginUser(db, {
          email: "budi@aruskas.test",
          password: "SalahPassword",
        });
      } catch (err) {
        wrongPassErr = err;
      }
      expect(wrongPassErr).toBeInstanceOf(AppError);
      expect((wrongPassErr as AppError).status).toBe(401);

      let unknownEmailErr: unknown;
      try {
        await loginUser(db, {
          email: "tidakada@aruskas.test",
          password: "KataSandiValid99",
        });
      } catch (err) {
        unknownEmailErr = err;
      }
      expect(unknownEmailErr).toBeInstanceOf(AppError);
      expect((unknownEmailErr as AppError).status).toBe(401);

      const loggedIn = await loginUser(db, {
        email: "  BUDI@aruskas.test ",
        password: "KataSandiValid99",
      });
      expect(loggedIn.user.id).toBe(reg.user.id);
      expect(getUserBySessionToken(db, loggedIn.token)?.id).toBe(reg.user.id);

      destroySession(db, loggedIn.token);
      expect(getUserBySessionToken(db, loggedIn.token)).toBeNull();

      // Test expired session cleanup
      const expiredSession = createSession(db, reg.user.id, "TestAgent");
      const hashedId = hashSessionToken(expiredSession.token);
      db.update(sessions)
        .set({ expiresAt: "2020-01-01T00:00:00.000Z" })
        .where(eq(sessions.id, hashedId))
        .run();

      expect(getUserBySessionToken(db, expiredSession.token)).toBeNull();
      const remaining = db
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashedId))
        .get();
      expect(remaining).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });

  test("ensureDemoSeeded creates realistic 6-month Indonesian demo data idempotently with reconciled wallet balances", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const demoUser = await ensureDemoSeeded(db);
      expect(demoUser.email).toBe(DEMO_EMAIL);
      expect(demoUser.isDemo).toBe(true);
      expect(demoUser.monthlySavingsTarget).toBe(25);

      const partnerUser = db
        .select()
        .from(users)
        .where(eq(users.email, DEMO_PARTNER_EMAIL))
        .get();
      expect(partnerUser).toBeDefined();

      const ownedWallets = db
        .select()
        .from(wallets)
        .where(eq(wallets.ownerId, demoUser.id))
        .all();
      expect(ownedWallets).toHaveLength(4);

      const demoMemberships = db
        .select()
        .from(walletMembers)
        .where(eq(walletMembers.userId, demoUser.id))
        .all();
      const watchedWallets = demoMemberships.filter((m) => m.role === "viewer");
      expect(watchedWallets).toHaveLength(1);

      const allWallets = db.select().from(wallets).all();
      expect(allWallets).toHaveLength(5);

      const allTx = db.select().from(transactions).all();
      expect(allTx.length).toBeGreaterThanOrEqual(42);

      // Verify 6-month span ending in current month
      const distinctMonths = new Set(
        allTx.map((tx) => tx.occurredAt.slice(0, 7))
      );
      expect(distinctMonths.size).toBeGreaterThanOrEqual(6);
      expect(distinctMonths.has(getCurrentMonthYM())).toBe(true);

      // Verify shared Kas Rumah Tangga has transactions by both Raka and Nadia
      const kasWallet = ownedWallets.find((w) => w.name === "Kas Rumah Tangga");
      expect(kasWallet).toBeDefined();
      expect(kasWallet!.isShared).toBe(true);
      const kasTxUsers = new Set(
        allTx
          .filter((tx) => tx.walletId === kasWallet!.id)
          .map((tx) => tx.userId)
      );
      expect(kasTxUsers.has(demoUser.id)).toBe(true);
      expect(kasTxUsers.has(partnerUser!.id)).toBe(true);

      // Verify exact wallet balance math: balance === initialBalance + inflow - outflow
      for (const wallet of allWallets) {
        let inflow = 0;
        let outflow = 0;
        for (const tx of allTx) {
          if (tx.type === "income" && tx.walletId === wallet.id) {
            inflow += tx.amount;
          } else if (tx.type === "expense" && tx.walletId === wallet.id) {
            outflow += tx.amount;
          } else if (tx.type === "transfer") {
            if (tx.walletId === wallet.id) {
              outflow += tx.amount;
            }
            if (tx.targetWalletId === wallet.id) {
              inflow += tx.amount;
            }
          }
        }
        expect(wallet.balance).toBe(wallet.initialBalance + inflow - outflow);
      }

      const demoBudgets = db
        .select()
        .from(budgets)
        .where(eq(budgets.userId, demoUser.id))
        .all();
      expect(demoBudgets).toHaveLength(5);
      expect(
        demoBudgets.every((b) => b.month === getCurrentMonthYM())
      ).toBe(true);

      const demoGoals = db
        .select()
        .from(savingsGoals)
        .where(eq(savingsGoals.userId, demoUser.id))
        .all();
      expect(demoGoals).toHaveLength(3);

      const demoRules = db
        .select()
        .from(recurringRules)
        .where(eq(recurringRules.userId, demoUser.id))
        .all();
      expect(demoRules).toHaveLength(3);
      const today = getTodayISO();
      const dueRules = demoRules.filter(
        (rule) => rule.isActive && rule.nextRunDate <= today
      );
      expect(dueRules.length).toBeGreaterThanOrEqual(1);

      // Idempotency check
      const secondCall = await ensureDemoSeeded(db);
      expect(secondCall.id).toBe(demoUser.id);
      expect(db.select().from(wallets).all()).toHaveLength(5);
      expect(db.select().from(transactions).all()).toHaveLength(allTx.length);
      expect(db.select().from(budgets).all()).toHaveLength(5);
      expect(db.select().from(savingsGoals).all()).toHaveLength(3);
      expect(db.select().from(recurringRules).all()).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });

  test("updateUserProfile and changePassword enforce demo guard and password rules", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const demoUser = await ensureDemoSeeded(db);

      let demoErr: unknown;
      try {
        await changePassword(db, demoUser.id, "demo1234", "NewDemoPass123");
      } catch (err) {
        demoErr = err;
      }
      expect(demoErr).toBeInstanceOf(AppError);
      expect((demoErr as AppError).status).toBe(403);

      const reg = await registerUser(db, {
        name: "Dewi Lestari",
        email: "dewi@aruskas.test",
        password: "PasswordLama123",
      });

      const updatedProfile = updateUserProfile(db, reg.user.id, {
        name: "  Dewi Lestari Putri ",
        monthlySavingsTarget: 30,
      });
      expect(updatedProfile.name).toBe("Dewi Lestari Putri");
      expect(updatedProfile.monthlySavingsTarget).toBe(30);

      let wrongCurrentErr: unknown;
      try {
        await changePassword(db, reg.user.id, "SalahSandi", "PasswordBaru456");
      } catch (err) {
        wrongCurrentErr = err;
      }
      expect(wrongCurrentErr).toBeInstanceOf(AppError);
      expect((wrongCurrentErr as AppError).status).toBe(400);

      await changePassword(
        db,
        reg.user.id,
        "PasswordLama123",
        "PasswordBaru456"
      );

      let oldLoginErr: unknown;
      try {
        await loginUser(db, {
          email: "dewi@aruskas.test",
          password: "PasswordLama123",
        });
      } catch (err) {
        oldLoginErr = err;
      }
      expect(oldLoginErr).toBeInstanceOf(AppError);
      expect((oldLoginErr as AppError).status).toBe(401);

      const newLogin = await loginUser(db, {
        email: "dewi@aruskas.test",
        password: "PasswordBaru456",
      });
      expect(newLogin.user.id).toBe(reg.user.id);
    } finally {
      sqlite.close();
    }
  });

  test("resetDemoData restores clean baseline after demo mutations", async () => {
    const { db, sqlite } = createDb(":memory:");
    try {
      const initialDemo = await ensureDemoSeeded(db);
      const baselineTxCount = db.select().from(transactions).all().length;

      // Mutate demo state: add wallet, add transaction, add goal, create session
      const now = new Date().toISOString();
      const extraWalletId = crypto.randomUUID();
      db.insert(wallets)
        .values({
          id: extraWalletId,
          ownerId: initialDemo.id,
          name: "Dompet Tambahan Sementara",
          type: "cash",
          initialBalance: 500000,
          balance: 500000,
          isShared: false,
          createdAt: now,
        })
        .run();

      db.insert(walletMembers)
        .values({
          id: crypto.randomUUID(),
          walletId: extraWalletId,
          userId: initialDemo.id,
          role: "owner",
          createdAt: now,
        })
        .run();

      db.insert(transactions)
        .values({
          id: crypto.randomUUID(),
          walletId: extraWalletId,
          userId: initialDemo.id,
          type: "expense",
          amount: 50000,
          title: "Transaksi Uji Reset",
          occurredAt: getTodayISO(),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(savingsGoals)
        .values({
          id: crypto.randomUUID(),
          userId: initialDemo.id,
          walletId: extraWalletId,
          name: "Target Uji Reset",
          targetAmount: 1000000,
          currentAmount: 100000,
          createdAt: now,
        })
        .run();

      createSession(db, initialDemo.id, "MutatedSession");

      const resetDemo = await resetDemoData(db);
      expect(resetDemo.email).toBe(DEMO_EMAIL);
      expect(resetDemo.id).not.toBe(initialDemo.id);

      const allWallets = db.select().from(wallets).all();
      expect(allWallets).toHaveLength(5);
      expect(
        allWallets.find((w) => w.name === "Dompet Tambahan Sementara")
      ).toBeUndefined();

      expect(db.select().from(transactions).all()).toHaveLength(
        baselineTxCount
      );
      expect(db.select().from(savingsGoals).all()).toHaveLength(3);
      expect(db.select().from(budgets).all()).toHaveLength(5);
      expect(db.select().from(recurringRules).all()).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });
});
