import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { closeDb, createDb, getDb } from "@/db";
import {
  budgets,
  categories,
  recurringRules,
  transactions,
  users,
  walletMembers,
  wallets,
} from "@/db/schema";
import { AppError, handleApiError } from "@/lib/errors";
import {
  escapeCsvCell,
  formatDateID,
  formatIDR,
  formatMonthID,
  getCurrentMonthYM,
  getPreviousMonthYM,
  getTodayISO,
} from "@/lib/format";
import { resolveSafeNext } from "@/lib/navigation";

describe("Database Foundation & Schema", () => {
  test("createDb(':memory:') creates all 18 PostgreSQL tables, enforces foreign keys, and supports 64-bit BIGINT Rupiah amounts", async () => {
    const { db, close, queryRaw } = await createDb(":memory:");
    try {
      const tableResult = await queryRaw(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
      );

      const tableNames = tableResult.rows.map((row) => String(row.table_name));
      expect(tableNames).toEqual([
        "bank_integrations",
        "bank_sync_logs",
        "budgets",
        "categories",
        "debts",
        "password_reset_tokens",
        "rate_limits",
        "recurring_rules",
        "savings_goals",
        "sessions",
        "split_bill_participants",
        "split_bills",
        "transaction_attachments",
        "transactions",
        "users",
        "wallet_invites",
        "wallet_members",
        "wallets",
      ]);

      await expect(
        (async () => {
          await db.insert(wallets).values({
            id: "w-invalid",
            ownerId: "user-does-not-exist",
            name: "Dompet Uji",
            type: "cash",
            initialBalance: 0,
            balance: 0,
            isShared: false,
            createdAt: "2026-11-21T00:00:00.000Z",
          });
        })()
      ).rejects.toThrow();

      // Verify 64-bit BIGINT handles Rupiah values above 32-bit int max (> Rp 2,14B)
      const now = "2026-11-21T00:00:00.000Z";
      await db.insert(users).values({
        id: "u-big",
        name: "Sultan",
        email: "sultan@example.com",
        passwordHash: "hash",
        monthlySavingsTarget: 20,
        createdAt: now,
      });
      await db.insert(wallets).values({
        id: "w-big",
        ownerId: "u-big",
        name: "Rekening Prioritas",
        type: "bank",
        initialBalance: 5_000_000_000,
        balance: 5_000_000_000,
        isShared: false,
        createdAt: now,
      });
      const [bigWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, "w-big"));
      expect(bigWallet.balance).toBe(5_000_000_000);
    } finally {
      await close();
    }
  });

  test("enforces unique constraints on wallet_members and budgets", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const now = "2026-11-21T00:00:00.000Z";
      await db.insert(users).values({
        id: "u1",
        name: "Budi",
        email: "budi@example.com",
        passwordHash: "hash",
        monthlySavingsTarget: 0,
        createdAt: now,
      });

      await db.insert(wallets).values({
        id: "w1",
        ownerId: "u1",
        name: "Dompet Utama",
        type: "cash",
        initialBalance: 100000,
        balance: 100000,
        isShared: false,
        createdAt: now,
      });

      await db.insert(walletMembers).values({
        id: "wm1",
        walletId: "w1",
        userId: "u1",
        role: "owner",
        createdAt: now,
      });

      await expect(
        (async () => {
          await db.insert(walletMembers).values({
            id: "wm2",
            walletId: "w1",
            userId: "u1",
            role: "editor",
            createdAt: now,
          });
        })()
      ).rejects.toThrow();

      await db.insert(categories).values({
        id: "c1",
        userId: "u1",
        name: "Makan",
        type: "expense",
        icon: "utensils",
        color: "#14532D",
        isDefault: true,
        createdAt: now,
      });

      await db.insert(budgets).values({
        id: "b1",
        userId: "u1",
        categoryId: "c1",
        month: "2026-11",
        limitAmount: 1000000,
        createdAt: now,
      });

      await expect(
        (async () => {
          await db.insert(budgets).values({
            id: "b2",
            userId: "u1",
            categoryId: "c1",
            month: "2026-11",
            limitAmount: 1500000,
            createdAt: now,
          });
        })()
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  test("partial unique index on transactions(recurring_rule_id, occurred_at) blocks duplicate non-null pairs while allowing multiple NULLs", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const now = "2026-11-21T00:00:00.000Z";
      await db.insert(users).values({
        id: "u1",
        name: "Sari",
        email: "sari@example.com",
        passwordHash: "hash",
        monthlySavingsTarget: 0,
        createdAt: now,
      });

      await db.insert(wallets).values({
        id: "w1",
        ownerId: "u1",
        name: "Bank BCA",
        type: "bank",
        initialBalance: 5000000,
        balance: 5000000,
        isShared: false,
        createdAt: now,
      });

      await db.insert(categories).values({
        id: "c1",
        userId: "u1",
        name: "Listrik",
        type: "expense",
        icon: "zap",
        color: "#D97706",
        isDefault: false,
        createdAt: now,
      });

      await db.insert(recurringRules).values({
        id: "r1",
        userId: "u1",
        walletId: "w1",
        categoryId: "c1",
        type: "expense",
        amount: 350000,
        title: "Tagihan Listrik",
        frequency: "monthly",
        nextRunDate: "2026-11-21",
        isActive: true,
        createdAt: now,
      });

      // Multiple NULL recurringRuleId on the same date should succeed
      await db.insert(transactions).values([
        {
          id: "t1",
          walletId: "w1",
          categoryId: "c1",
          userId: "u1",
          type: "expense",
          amount: 25000,
          title: "Kopi Pagi",
          occurredAt: "2026-11-21",
          recurringRuleId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "t2",
          walletId: "w1",
          categoryId: "c1",
          userId: "u1",
          type: "expense",
          amount: 40000,
          title: "Makan Siang",
          occurredAt: "2026-11-21",
          recurringRuleId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // First recurring posting succeeds
      await db.insert(transactions).values({
        id: "t3",
        walletId: "w1",
        categoryId: "c1",
        userId: "u1",
        type: "expense",
        amount: 350000,
        title: "Tagihan Listrik",
        occurredAt: "2026-11-21",
        recurringRuleId: "r1",
        createdAt: now,
        updatedAt: now,
      });

      // Duplicate (recurring_rule_id, occurred_at) must throw
      await expect(
        (async () => {
          await db.insert(transactions).values({
            id: "t4",
            walletId: "w1",
            categoryId: "c1",
            userId: "u1",
            type: "expense",
            amount: 350000,
            title: "Tagihan Listrik Duplikat",
            occurredAt: "2026-11-21",
            recurringRuleId: "r1",
            createdAt: now,
            updatedAt: now,
          });
        })()
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  test("getDb() closes previous database handle on DATABASE_PATH switch and closeDb() releases locks", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    const tempDir1 = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-db-sw1-"));
    const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-db-sw2-"));
    try {
      process.env.DATABASE_PATH = path.join(tempDir1, "pg1");
      const db1 = await getDb();
      expect(await db1.select().from(users)).toEqual([]);

      // Switching DATABASE_PATH must close the first handle before opening the second
      process.env.DATABASE_PATH = path.join(tempDir2, "pg2");
      const db2 = await getDb();
      expect(db2).not.toBe(db1);
      expect(await db2.select().from(users)).toEqual([]);

      // Removing tempDir1 succeeds cleanly now that its handle was closed
      fs.rmSync(tempDir1, { recursive: true, force: true });
      expect(fs.existsSync(tempDir1)).toBe(false);

      await closeDb();
      fs.rmSync(tempDir2, { recursive: true, force: true });
      expect(fs.existsSync(tempDir2)).toBe(false);
    } finally {
      await closeDb();
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
      fs.rmSync(tempDir1, { recursive: true, force: true });
      fs.rmSync(tempDir2, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("Formatters & CSV Sanitization", () => {
  test("formatIDR formats Indonesian Rupiah with optional sign", () => {
    expect(formatIDR(1250000)).toBe("Rp 1.250.000");
    expect(formatIDR(-45000, { signed: true })).toBe("-Rp 45.000");
    expect(formatIDR(45000, { signed: true })).toBe("+Rp 45.000");
    expect(formatIDR(0)).toBe("Rp 0");
    expect(formatIDR(0, { signed: true })).toBe("Rp 0");
    expect(formatIDR(-45000)).toBe("-Rp 45.000");
  });

  test("Indonesian date and month helpers format accurately", () => {
    expect(formatDateID("2026-11-21")).toBe("21 Nov 2026");
    expect(formatDateID("2026-01-05")).toBe("5 Jan 2026");
    expect(formatMonthID("2026-11")).toBe("November 2026");
    expect(formatMonthID("2026-08")).toBe("Agustus 2026");
    expect(getPreviousMonthYM("2026-01")).toBe("2025-12");
    expect(getPreviousMonthYM("2026-11")).toBe("2026-10");

    const sampleDate = new Date(2026, 10, 21); // Nov 21, 2026 local
    expect(getCurrentMonthYM(sampleDate)).toBe("2026-11");
    expect(getTodayISO(sampleDate)).toBe("2026-11-21");
  });

  test("escapeCsvCell neutralizes formula injection and escapes quotes/commas", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("+1234")).toBe("'+1234");
    expect(escapeCsvCell("-1234")).toBe("'-1234");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    expect(escapeCsvCell("\t123")).toBe("'\t123");
    expect(escapeCsvCell("\r123")).toBe('"\'\r123"');
    expect(escapeCsvCell('Makan, "Siang"')).toBe('"Makan, ""Siang"""');
    expect(escapeCsvCell("=SUM(A1,B1)")).toBe('"\'=SUM(A1,B1)"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell(1250000)).toBe("1250000");
  });
});

describe("Errors & handleApiError", () => {
  test("handles AppError with status and Indonesian message", async () => {
    const res = handleApiError(
      new AppError(403, "Anda tidak memiliki izin akses dompet ini.", "FORBIDDEN")
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: "Anda tidak memiliki izin akses dompet ini.",
      code: "FORBIDDEN",
    });
  });

  test("handles ZodError as HTTP 400 with first issue message", async () => {
    const schema = z.object({
      amount: z.number().int().positive("Nominal harus lebih dari nol."),
    });
    const parsed = schema.safeParse({ amount: -10 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const res = handleApiError(parsed.error);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Nominal harus lebih dari nol.");
    }
  });

  test("handles unknown errors as HTTP 500 with safe Indonesian message", async () => {
    const res = handleApiError(new Error("Internal secret detail"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "Terjadi kesalahan pada server.",
    });
  });
});

describe("Navigation Redirect Sanitization", () => {
  test("resolveSafeNext preserves valid internal paths and falls back to /dashboard for open redirects", () => {
    expect(resolveSafeNext("/undangan/abc123")).toBe("/undangan/abc123");
    expect(resolveSafeNext("/transaksi?type=expense&page=2#atas")).toBe(
      "/transaksi?type=expense&page=2#atas"
    );
    expect(resolveSafeNext("/dashboard")).toBe("/dashboard");

    expect(resolveSafeNext(null)).toBe("/dashboard");
    expect(resolveSafeNext(undefined)).toBe("/dashboard");
    expect(resolveSafeNext("")).toBe("/dashboard");
    expect(resolveSafeNext("/\\evil.com")).toBe("/dashboard");
    expect(resolveSafeNext("/\\t/evil.com")).toBe("/dashboard");
    expect(resolveSafeNext("/\tevil.com")).toBe("/dashboard");
    expect(resolveSafeNext("//evil.com")).toBe("/dashboard");
    expect(resolveSafeNext("///evil.com")).toBe("/dashboard");
    expect(resolveSafeNext("https://evil.com")).toBe("/dashboard");
    expect(resolveSafeNext("https://aruskas.local/dashboard")).toBe("/dashboard");
    expect(resolveSafeNext(" //evil.com")).toBe("/dashboard");
    expect(resolveSafeNext("/foo\\bar")).toBe("/dashboard");
    expect(resolveSafeNext("/a/..//evil.com")).toBe("/dashboard");
  });
});
