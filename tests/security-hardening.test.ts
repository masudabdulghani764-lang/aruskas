import { describe, expect, test } from "bun:test";
import { closeDb, createDb, getDb } from "@/db";
import { GET as cronRecurringRoute } from "@/app/api/cron/recurring/route";
import { POST as bcaWebhookRoute } from "@/app/api/integrations/bca/webhook/route";
import { assertAttachmentMagicBytes, prepareAttachmentForDb } from "@/lib/attachments";
import {
  changePassword,
  createSession,
  getUserBySessionToken,
  registerUser,
  revokeAllUserSessions,
} from "@/lib/auth";
import { upsertBcaIntegration } from "@/lib/bca-integration";
import { upsertBudget } from "@/lib/budgets";
import { listCategories } from "@/lib/categories";
import { AppError } from "@/lib/errors";
import { buildUserBackupJson, restoreUserBackupJson } from "@/lib/export";
import { createSavingsGoal } from "@/lib/goals";
import { createRecurringRule } from "@/lib/recurring";
import { enforceRateLimit, isAllowedOrigin } from "@/lib/security";
import { createTransaction, listTransactions } from "@/lib/transactions";
import {
  acceptWalletInvite,
  createWallet,
  createWalletInvite,
  listUserWallets,
  updateWalletMemberRole,
} from "@/lib/wallets";

describe("Production Security Hardening, Backup Restore & Cron", () => {
  test("enforceRateLimit blocks requests exceeding threshold with AppError 429", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const r1 = await enforceRateLimit(db, {
        scope: "test_login",
        identifier: "1.2.3.4:user@test.id",
        limit: 2,
        windowMs: 60_000,
      });
      expect(r1.remaining).toBe(1);

      const r2 = await enforceRateLimit(db, {
        scope: "test_login",
        identifier: "1.2.3.4:user@test.id",
        limit: 2,
        windowMs: 60_000,
      });
      expect(r2.remaining).toBe(0);

      let caught: unknown;
      try {
        await enforceRateLimit(db, {
          scope: "test_login",
          identifier: "1.2.3.4:user@test.id",
          limit: 2,
          windowMs: 60_000,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).status).toBe(429);
      expect((caught as AppError).code).toBe("RATE_LIMITED");
    } finally {
      await close();
    }
  });

  test("isAllowedOrigin permits same-origin or server-to-server calls and blocks cross-site Origin", () => {
    const noOrigin = new Request("https://aruskas-bay.vercel.app/api/wallets", {
      method: "POST",
    });
    expect(isAllowedOrigin(noOrigin)).toBe(true);

    const sameOrigin = new Request("https://aruskas-bay.vercel.app/api/wallets", {
      method: "POST",
      headers: {
        host: "aruskas-bay.vercel.app",
        origin: "https://aruskas-bay.vercel.app",
      },
    });
    expect(isAllowedOrigin(sameOrigin)).toBe(true);

    const crossSite = new Request("https://aruskas-bay.vercel.app/api/wallets", {
      method: "POST",
      headers: {
        host: "aruskas-bay.vercel.app",
        origin: "https://evil.example.com",
      },
    });
    expect(isAllowedOrigin(crossSite)).toBe(false);
  });

  test("assertAttachmentMagicBytes rejects spoofed HTML/text disguised as PNG or PDF", () => {
    const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const validJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const validWebp = new TextEncoder().encode("RIFF1234WEBP");
    const validPdf = new TextEncoder().encode("%PDF-1.7\n");

    expect(() => assertAttachmentMagicBytes("image/png", validPng)).not.toThrow();
    expect(() => assertAttachmentMagicBytes("image/jpeg", validJpg)).not.toThrow();
    expect(() => assertAttachmentMagicBytes("image/webp", validWebp)).not.toThrow();
    expect(() => assertAttachmentMagicBytes("application/pdf", validPdf)).not.toThrow();

    const spoofedHtml = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(() =>
      prepareAttachmentForDb({
        name: "fake.png",
        type: "image/png",
        buffer: spoofedHtml,
      })
    ).toThrow(AppError);

    expect(() =>
      prepareAttachmentForDb({
        name: "fake.pdf",
        type: "application/pdf",
        buffer: spoofedHtml,
      })
    ).toThrow(AppError);
  });

  test("revokeAllUserSessions & changePassword invalidate other devices while preserving current session", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Budi",
        email: "budi-sec@aruskas.test",
        password: "PasswordLama123!",
      });
      const phoneSession = await createSession(db, reg.user.id, "iPhone");
      const tabletSession = await createSession(db, reg.user.id, "iPad");

      const revoked = await revokeAllUserSessions(db, reg.user.id, reg.token);
      expect(revoked).toBe(2);
      expect(await getUserBySessionToken(db, reg.token)).not.toBeNull();
      expect(await getUserBySessionToken(db, phoneSession.token)).toBeNull();
      expect(await getUserBySessionToken(db, tabletSession.token)).toBeNull();

      const anotherDevice = await createSession(db, reg.user.id, "Android");
      await changePassword(
        db,
        reg.user.id,
        "PasswordLama123!",
        "PasswordBaru456!",
        reg.token
      );
      expect(await getUserBySessionToken(db, reg.token)).not.toBeNull();
      expect(await getUserBySessionToken(db, anotherDevice.token)).toBeNull();
    } finally {
      await close();
    }
  });

  test("restoreUserBackupJson restores wallets, transactions, budgets, goals, and recurring rules with exact balances", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const source = await registerUser(db, {
        name: "Sumber",
        email: "sumber-bak@aruskas.test",
        password: "Password123!",
      });
      const target = await registerUser(db, {
        name: "Tujuan",
        email: "tujuan-bak@aruskas.test",
        password: "Password123!",
      });

      const bca = await createWallet(db, source.user.id, {
        name: "BCA Utama",
        type: "bank",
        initialBalance: 2_000_000,
      });
      const cats = await listCategories(db, source.user.id);
      const expenseCat = cats.find((c) => c.type === "expense")!;
      const incomeCat = cats.find((c) => c.type === "income")!;

      await createTransaction(db, source.user.id, {
        walletId: bca.id,
        categoryId: incomeCat.id,
        type: "income",
        amount: 3_000_000,
        title: "Gaji",
        occurredAt: "2026-11-01",
      });
      await createTransaction(db, source.user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 500_000,
        title: "Belanja",
        occurredAt: "2026-11-05",
      });
      await upsertBudget(db, source.user.id, {
        categoryId: expenseCat.id,
        month: "2026-11",
        limitAmount: 1_500_000,
      });
      await createSavingsGoal(db, source.user.id, {
        name: "Dana Darurat",
        targetAmount: 10_000_000,
        currentAmount: 2_500_000,
        walletId: bca.id,
      });
      await createRecurringRule(db, source.user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 250_000,
        title: "Internet",
        frequency: "monthly",
        nextRunDate: "2026-12-01",
      });

      const snapshot = await buildUserBackupJson(db, source.user);
      const summary = await restoreUserBackupJson(db, target.user.id, snapshot);

      expect(summary.walletsImported).toBe(2); // Dompet Utama + BCA Utama
      expect(summary.transactionsImported).toBe(2);
      expect(summary.budgetsImported).toBe(1);
      expect(summary.goalsImported).toBe(1);
      expect(summary.recurringImported).toBe(1);

      const targetWallets = await listUserWallets(db, target.user.id);
      const restoredBca = targetWallets.find((w) => w.name === "BCA Utama");
      expect(restoredBca).toBeDefined();
      expect(restoredBca!.balance).toBe(4_500_000); // 2M + 3M - 500k

      const targetTx = await listTransactions(db, target.user.id, {});
      expect(targetTx.items).toHaveLength(2);

      // Verify updateWalletMemberRole switches editor <-> viewer cleanly
      const invite = await createWalletInvite(db, bca.id, source.user.id, {
        email: target.user.email,
        role: "editor",
      });
      await acceptWalletInvite(db, invite.token, target.user);

      const changed = await updateWalletMemberRole(
        db,
        bca.id,
        source.user.id,
        target.user.id,
        "viewer"
      );
      expect(changed.role).toBe("viewer");

      const afterSwitch = (await listUserWallets(db, target.user.id)).find(
        (w) => w.id === bca.id
      );
      expect(afterSwitch?.role).toBe("viewer");
    } finally {
      await close();
    }
  });

  test("BCA webhook rejects URL query ?token= leaks and cron endpoint enforces CRON_SECRET + idempotently applies due rules", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    const prevCronSecret = process.env.CRON_SECRET;
    process.env.DATABASE_PATH = `memory://sec-routes-${crypto.randomUUID()}`;
    process.env.CRON_SECRET = "test-cron-secret-value-123";

    try {
      const db = await getDb();
      const { user } = await registerUser(db, {
        name: "Siti",
        email: "siti-sec@aruskas.test",
        password: "Password123!",
      });
      const bca = await createWallet(db, user.id, {
        name: "BCA Auto",
        type: "bank",
        initialBalance: 1_000_000,
      });
      const setup = await upsertBcaIntegration(db, user.id, {
        walletId: bca.id,
        isActive: true,
        autoCategorize: true,
      });

      // 1. Query param ?token= must be rejected with HTTP 400
      const queryLeakRes = await bcaWebhookRoute(
        new Request(
          `http://localhost/api/integrations/bca/webhook?token=${setup.rawToken}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: "Transfer masuk Rp 100.000 dari BUDI pada 21/11/2026 Ref: Q01",
            }),
          }
        )
      );
      expect(queryLeakRes.status).toBe(400);

      // Header Bearer token succeeds -> 201
      const headerOkRes = await bcaWebhookRoute(
        new Request("http://localhost/api/integrations/bca/webhook", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${setup.rawToken}`,
          },
          body: JSON.stringify({
            text: "Anda menerima transfer sebesar Rp 100.000,00 dari BUDI pada 21/11/2026 Ref: H01",
          }),
        })
      );
      expect(headerOkRes.status).toBe(201);

      // 2. Cron recurring endpoint rejects missing/invalid CRON_SECRET -> 401
      const unauthCron = await cronRecurringRoute(
        new Request("http://localhost/api/cron/recurring")
      );
      expect(unauthCron.status).toBe(401);

      const expenseCat = (await listCategories(db, user.id, { type: "expense" }))[0];
      await createRecurringRule(db, user.id, {
        walletId: bca.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 200_000,
        title: "Tagihan Air Otomatis",
        frequency: "monthly",
        nextRunDate: "2026-11-01",
      });

      const okCron = await cronRecurringRoute(
        new Request("http://localhost/api/cron/recurring", {
          headers: { authorization: "Bearer test-cron-secret-value-123" },
        })
      );
      expect(okCron.status).toBe(200);
      const cronJson = (await okCron.json()) as { applied: number };
      expect(cronJson.applied).toBe(1);

      // Second cron run applies 0 (nextRunDate already advanced)
      const secondCron = await cronRecurringRoute(
        new Request("http://localhost/api/cron/recurring", {
          headers: { authorization: "Bearer test-cron-secret-value-123" },
        })
      );
      expect(((await secondCron.json()) as { applied: number }).applied).toBe(0);
    } finally {
      await closeDb();
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
      if (prevCronSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = prevCronSecret;
      }
    }
  });
});
