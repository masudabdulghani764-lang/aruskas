import { eq, inArray, or } from "drizzle-orm";
import type { AppDb } from "@/db";
import {
  budgets,
  categories,
  recurringRules,
  savingsGoals,
  sessions,
  transactions,
  users,
  walletInvites,
  walletMembers,
  wallets,
} from "@/db/schema";
import {
  DEMO_EMAIL,
  DEMO_PARTNER_EMAIL,
  type SafeUser,
  hashPassword,
  toSafeUser,
} from "@/lib/auth";
import { getCurrentMonthYM, getTodayISO } from "@/lib/format";

export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  type: "income" | "expense";
  icon: string;
  color: string;
}> = [
  { name: "Gaji", type: "income", icon: "Briefcase", color: "#10b981" },
  {
    name: "Bisnis & Freelance",
    type: "income",
    icon: "Laptop",
    color: "#059669",
  },
  {
    name: "Investasi",
    type: "income",
    icon: "TrendingUp",
    color: "#0ea5e9",
  },
  {
    name: "Hadiah & Bonus",
    type: "income",
    icon: "Gift",
    color: "#8b5cf6",
  },
  {
    name: "Pemasukan Lainnya",
    type: "income",
    icon: "PlusCircle",
    color: "#64748b",
  },
  {
    name: "Makanan & Minuman",
    type: "expense",
    icon: "Utensils",
    color: "#f97316",
  },
  { name: "Transportasi", type: "expense", icon: "Car", color: "#3b82f6" },
  {
    name: "Belanja Rumah Tangga",
    type: "expense",
    icon: "ShoppingBag",
    color: "#ec4899",
  },
  {
    name: "Tagihan & Utilitas",
    type: "expense",
    icon: "Receipt",
    color: "#ef4444",
  },
  {
    name: "Kesehatan",
    type: "expense",
    icon: "HeartPulse",
    color: "#14b8a6",
  },
  {
    name: "Pendidikan",
    type: "expense",
    icon: "GraduationCap",
    color: "#6366f1",
  },
  {
    name: "Hiburan & Gaya Hidup",
    type: "expense",
    icon: "Film",
    color: "#a855f7",
  },
];

/**
 * Inserts the 12 default Indonesian income/expense categories for a user.
 */
export function seedDefaultCategoriesForUser(db: AppDb, userId: string): void {
  const now = new Date().toISOString();
  db.insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((cat) => ({
        id: crypto.randomUUID(),
        userId,
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
        isDefault: true,
        createdAt: now,
      }))
    )
    .run();
}

function getMonthDateISO(
  baseDate: Date,
  monthsAgo: number,
  preferredDay: number
): string {
  const target = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth() - monthsAgo,
    1
  );
  const maxDayInMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  const capDay =
    monthsAgo === 0
      ? Math.min(preferredDay, baseDate.getDate())
      : Math.min(preferredDay, maxDayInMonth);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(Math.max(1, capDay)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysISO(baseDate: Date, deltaDays: number): string {
  const d = new Date(baseDate.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return getTodayISO(d);
}

/**
 * Idempotently seeds the full Indonesian demo workspace (Raka & Nadia Pratama)
 * with 5 wallets (including shared & viewer-watched), >=42 6-month transactions,
 * current-month budgets, 3 savings goals, and 3 recurring rules (>=1 due).
 */
export async function ensureDemoSeeded(db: AppDb): Promise<SafeUser> {
  const existing = db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .get();
  if (existing) {
    return toSafeUser(existing);
  }

  const demoPasswordHash = await hashPassword("demo1234");
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const currentMonth = getCurrentMonthYM(nowDate);
  const todayISO = getTodayISO(nowDate);
  const yesterdayISO = addDaysISO(nowDate, -1);
  const nextMonthFirst = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth() + 1,
    1
  );
  const nextMonthFirstISO = getTodayISO(nextMonthFirst);

  return db.transaction((tx) => {
    const insideExisting = tx
      .select()
      .from(users)
      .where(eq(users.email, DEMO_EMAIL))
      .get();
    if (insideExisting) {
      return toSafeUser(insideExisting);
    }

    const demoUserId = crypto.randomUUID();
    const partnerUserId = crypto.randomUUID();

    tx.insert(users)
      .values([
        {
          id: demoUserId,
          name: "Raka Pratama",
          email: DEMO_EMAIL,
          passwordHash: demoPasswordHash,
          monthlySavingsTarget: 25,
          createdAt: nowIso,
        },
        {
          id: partnerUserId,
          name: "Nadia Pratama",
          email: DEMO_PARTNER_EMAIL,
          passwordHash: demoPasswordHash,
          monthlySavingsTarget: 20,
          createdAt: nowIso,
        },
      ])
      .run();

    seedDefaultCategoriesForUser(tx as unknown as AppDb, demoUserId);
    seedDefaultCategoriesForUser(tx as unknown as AppDb, partnerUserId);

    const demoCats = tx
      .select()
      .from(categories)
      .where(eq(categories.userId, demoUserId))
      .all();
    const partnerCats = tx
      .select()
      .from(categories)
      .where(eq(categories.userId, partnerUserId))
      .all();

    const demoCatByName = new Map(demoCats.map((c) => [c.name, c.id]));
    const partnerCatByName = new Map(partnerCats.map((c) => [c.name, c.id]));

    const bcaId = crypto.randomUUID();
    const tunaiId = crypto.randomUUID();
    const gopayId = crypto.randomUUID();
    const kasId = crypto.randomUUID();
    const nadiaSavingsId = crypto.randomUUID();

    const walletDefs: Array<{
      id: string;
      ownerId: string;
      name: string;
      type: "cash" | "bank" | "ewallet" | "savings";
      initialBalance: number;
      isShared: boolean;
    }> = [
      {
        id: bcaId,
        ownerId: demoUserId,
        name: "BCA Utama",
        type: "bank",
        initialBalance: 15_000_000,
        isShared: false,
      },
      {
        id: tunaiId,
        ownerId: demoUserId,
        name: "Dompet Tunai",
        type: "cash",
        initialBalance: 1_200_000,
        isShared: false,
      },
      {
        id: gopayId,
        ownerId: demoUserId,
        name: "GoPay & QRIS",
        type: "ewallet",
        initialBalance: 1_500_000,
        isShared: false,
      },
      {
        id: kasId,
        ownerId: demoUserId,
        name: "Kas Rumah Tangga",
        type: "bank",
        initialBalance: 4_000_000,
        isShared: true,
      },
      {
        id: nadiaSavingsId,
        ownerId: partnerUserId,
        name: "Tabungan Liburan Nadia",
        type: "savings",
        initialBalance: 6_000_000,
        isShared: true,
      },
    ];

    const balanceMap = new Map<string, number>(
      walletDefs.map((w) => [w.id, w.initialBalance])
    );

    const txRows: Array<typeof transactions.$inferInsert> = [];
    const pushTx = (input: {
      walletId: string;
      targetWalletId?: string | null;
      categoryId?: string | null;
      userId: string;
      type: "income" | "expense" | "transfer";
      amount: number;
      title: string;
      notes?: string | null;
      paymentMethod?: string | null;
      occurredAt: string;
    }) => {
      if (input.type === "income") {
        balanceMap.set(
          input.walletId,
          (balanceMap.get(input.walletId) ?? 0) + input.amount
        );
      } else if (input.type === "expense") {
        balanceMap.set(
          input.walletId,
          (balanceMap.get(input.walletId) ?? 0) - input.amount
        );
      } else if (input.type === "transfer" && input.targetWalletId) {
        balanceMap.set(
          input.walletId,
          (balanceMap.get(input.walletId) ?? 0) - input.amount
        );
        balanceMap.set(
          input.targetWalletId,
          (balanceMap.get(input.targetWalletId) ?? 0) + input.amount
        );
      }

      txRows.push({
        id: crypto.randomUUID(),
        walletId: input.walletId,
        targetWalletId: input.targetWalletId ?? null,
        categoryId: input.categoryId ?? null,
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        title: input.title,
        notes: input.notes ?? null,
        paymentMethod: input.paymentMethod ?? null,
        occurredAt: input.occurredAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    };

    for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
      pushTx({
        walletId: bcaId,
        categoryId: demoCatByName.get("Gaji"),
        userId: demoUserId,
        type: "income",
        amount: 14_500_000,
        title: "Gaji Bulanan",
        paymentMethod: "Transfer Bank",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 1),
      });

      pushTx({
        walletId: bcaId,
        targetWalletId: kasId,
        userId: demoUserId,
        type: "transfer",
        amount: 3_500_000,
        title: "Setoran Kas Rumah Tangga",
        paymentMethod: "Transfer Bank",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 2),
      });

      pushTx({
        walletId: bcaId,
        targetWalletId: gopayId,
        userId: demoUserId,
        type: "transfer",
        amount: 1_200_000,
        title: "Top Up GoPay & QRIS",
        paymentMethod: "Virtual Account",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 4),
      });

      pushTx({
        walletId: kasId,
        categoryId: demoCatByName.get("Belanja Rumah Tangga"),
        userId: partnerUserId,
        type: "expense",
        amount: 920_000 + monthsAgo * 25_000,
        title: "Belanja Bahan Dapur & Sayur",
        paymentMethod: "Kartu Debit",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 7),
      });

      pushTx({
        walletId: kasId,
        categoryId: demoCatByName.get("Tagihan & Utilitas"),
        userId: demoUserId,
        type: "expense",
        amount: 1_050_000,
        title: "Tagihan Listrik, Air & Internet",
        paymentMethod: "Autodebit",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 10),
      });

      pushTx({
        walletId: gopayId,
        categoryId: demoCatByName.get("Makanan & Minuman"),
        userId: demoUserId,
        type: "expense",
        amount: 485_000 + monthsAgo * 15_000,
        title: "Makan Siang & Kopi Mingguan",
        paymentMethod: "QRIS",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 13),
      });

      pushTx({
        walletId: tunaiId,
        categoryId: demoCatByName.get("Transportasi"),
        userId: demoUserId,
        type: "expense",
        amount: 340_000,
        title: "BBM, Parkir & Tol",
        paymentMethod: "Tunai",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 16),
      });

      pushTx({
        walletId: nadiaSavingsId,
        categoryId: partnerCatByName.get("Gaji"),
        userId: partnerUserId,
        type: "income",
        amount: 1_250_000,
        title: "Sisihan Tabungan Liburan",
        paymentMethod: "Transfer Bank",
        occurredAt: getMonthDateISO(nowDate, monthsAgo, 20),
      });

      if (monthsAgo % 2 === 0) {
        pushTx({
          walletId: bcaId,
          categoryId: demoCatByName.get("Bisnis & Freelance"),
          userId: demoUserId,
          type: "income",
          amount: 2_800_000,
          title: "Fee Konsultasi & Proyek Freelance",
          paymentMethod: "Transfer Bank",
          occurredAt: getMonthDateISO(nowDate, monthsAgo, 18),
        });
      } else {
        pushTx({
          walletId: bcaId,
          targetWalletId: tunaiId,
          userId: demoUserId,
          type: "transfer",
          amount: 500_000,
          title: "Tarik Tunai ATM",
          paymentMethod: "ATM",
          occurredAt: getMonthDateISO(nowDate, monthsAgo, 11),
        });
      }

      if (monthsAgo === 4 || monthsAgo === 1) {
        pushTx({
          walletId: kasId,
          categoryId: demoCatByName.get("Kesehatan"),
          userId: partnerUserId,
          type: "expense",
          amount: 420_000,
          title: "Vitamin & Cek Kesehatan Keluarga",
          paymentMethod: "Kartu Debit",
          occurredAt: getMonthDateISO(nowDate, monthsAgo, 21),
        });
      }

      if (monthsAgo === 3 || monthsAgo === 0) {
        pushTx({
          walletId: gopayId,
          categoryId: demoCatByName.get("Hiburan & Gaya Hidup"),
          userId: demoUserId,
          type: "expense",
          amount: 310_000,
          title: "Makan Malam & Bioskop Akhir Pekan",
          paymentMethod: "QRIS",
          occurredAt: getMonthDateISO(nowDate, monthsAgo, 14),
        });
      }
    }

    // Insert wallets with exact reconciled balances
    tx.insert(wallets)
      .values(
        walletDefs.map((w) => ({
          id: w.id,
          ownerId: w.ownerId,
          name: w.name,
          type: w.type,
          initialBalance: w.initialBalance,
          balance: balanceMap.get(w.id) ?? w.initialBalance,
          isShared: w.isShared,
          createdAt: nowIso,
        }))
      )
      .run();

    tx.insert(walletMembers)
      .values([
        {
          id: crypto.randomUUID(),
          walletId: bcaId,
          userId: demoUserId,
          role: "owner",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          walletId: tunaiId,
          userId: demoUserId,
          role: "owner",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          walletId: gopayId,
          userId: demoUserId,
          role: "owner",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          walletId: kasId,
          userId: demoUserId,
          role: "owner",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          walletId: kasId,
          userId: partnerUserId,
          role: "editor",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          walletId: nadiaSavingsId,
          userId: partnerUserId,
          role: "owner",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          walletId: nadiaSavingsId,
          userId: demoUserId,
          role: "viewer",
          createdAt: nowIso,
        },
      ])
      .run();

    tx.insert(transactions).values(txRows).run();

    const budgetConfigs: Array<[string, number]> = [
      ["Makanan & Minuman", 2_500_000],
      ["Transportasi", 1_000_000],
      ["Belanja Rumah Tangga", 2_200_000],
      ["Tagihan & Utilitas", 1_500_000],
      ["Hiburan & Gaya Hidup", 1_000_000],
    ];

    tx.insert(budgets)
      .values(
        budgetConfigs.map(([catName, limitAmount]) => ({
          id: crypto.randomUUID(),
          userId: demoUserId,
          categoryId: demoCatByName.get(catName)!,
          month: currentMonth,
          limitAmount,
          createdAt: nowIso,
        }))
      )
      .run();

    tx.insert(savingsGoals)
      .values([
        {
          id: crypto.randomUUID(),
          userId: demoUserId,
          walletId: bcaId,
          name: "Dana Darurat",
          targetAmount: 60_000_000,
          currentAmount: 38_500_000,
          deadline: `${nowDate.getFullYear() + 1}-12-31`,
          notes: "Cadangan 6 bulan biaya hidup keluarga",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          userId: demoUserId,
          walletId: bcaId,
          name: "Pendidikan Anak",
          targetAmount: 40_000_000,
          currentAmount: 16_000_000,
          deadline: `${nowDate.getFullYear() + 3}-06-30`,
          notes: "Persiapan uang pangkal sekolah dasar",
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          userId: demoUserId,
          walletId: kasId,
          name: "Liburan Keluarga",
          targetAmount: 15_000_000,
          currentAmount: 9_200_000,
          deadline: `${nowDate.getFullYear() + 1}-06-15`,
          notes: "Rencana liburan akhir semester ke Yogyakarta",
          createdAt: nowIso,
        },
      ])
      .run();

    tx.insert(recurringRules)
      .values([
        {
          id: crypto.randomUUID(),
          userId: demoUserId,
          walletId: kasId,
          categoryId: demoCatByName.get("Tagihan & Utilitas")!,
          type: "expense",
          amount: 450_000,
          title: "Tagihan Internet & WiFi Rumah",
          frequency: "monthly",
          nextRunDate: yesterdayISO,
          isActive: true,
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          userId: demoUserId,
          walletId: kasId,
          categoryId: demoCatByName.get("Tagihan & Utilitas")!,
          type: "expense",
          amount: 650_000,
          title: "Tagihan Listrik PLN",
          frequency: "monthly",
          nextRunDate: todayISO,
          isActive: true,
          createdAt: nowIso,
        },
        {
          id: crypto.randomUUID(),
          userId: demoUserId,
          walletId: bcaId,
          categoryId: demoCatByName.get("Gaji")!,
          type: "income",
          amount: 14_500_000,
          title: "Gaji Bulanan",
          frequency: "monthly",
          nextRunDate: nextMonthFirstISO,
          isActive: true,
          createdAt: nowIso,
        },
      ])
      .run();

    return toSafeUser({
      id: demoUserId,
      name: "Raka Pratama",
      email: DEMO_EMAIL,
      monthlySavingsTarget: 25,
      createdAt: nowIso,
    });
  });
}

/**
 * Deletes all demo & partner user data cleanly and re-seeds the fresh baseline.
 */
export async function resetDemoData(db: AppDb): Promise<SafeUser> {
  db.transaction((tx) => {
    const demoUsers = tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.email, [DEMO_EMAIL, DEMO_PARTNER_EMAIL]))
      .all();

    if (demoUsers.length === 0) {
      return;
    }

    const demoUserIds = demoUsers.map((u) => u.id);
    const ownedWallets = tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(inArray(wallets.ownerId, demoUserIds))
      .all();
    const ownedWalletIds = ownedWallets.map((w) => w.id);

    if (ownedWalletIds.length > 0) {
      tx.delete(transactions)
        .where(
          or(
            inArray(transactions.userId, demoUserIds),
            inArray(transactions.walletId, ownedWalletIds),
            inArray(transactions.targetWalletId, ownedWalletIds)
          )
        )
        .run();

      tx.delete(savingsGoals)
        .where(
          or(
            inArray(savingsGoals.userId, demoUserIds),
            inArray(savingsGoals.walletId, ownedWalletIds)
          )
        )
        .run();

      tx.delete(recurringRules)
        .where(
          or(
            inArray(recurringRules.userId, demoUserIds),
            inArray(recurringRules.walletId, ownedWalletIds)
          )
        )
        .run();

      tx.delete(walletInvites)
        .where(
          or(
            inArray(walletInvites.createdBy, demoUserIds),
            inArray(walletInvites.walletId, ownedWalletIds)
          )
        )
        .run();

      tx.delete(walletMembers)
        .where(
          or(
            inArray(walletMembers.userId, demoUserIds),
            inArray(walletMembers.walletId, ownedWalletIds)
          )
        )
        .run();
    } else {
      tx.delete(transactions)
        .where(inArray(transactions.userId, demoUserIds))
        .run();
      tx.delete(savingsGoals)
        .where(inArray(savingsGoals.userId, demoUserIds))
        .run();
      tx.delete(recurringRules)
        .where(inArray(recurringRules.userId, demoUserIds))
        .run();
      tx.delete(walletInvites)
        .where(inArray(walletInvites.createdBy, demoUserIds))
        .run();
      tx.delete(walletMembers)
        .where(inArray(walletMembers.userId, demoUserIds))
        .run();
    }

    tx.delete(budgets).where(inArray(budgets.userId, demoUserIds)).run();
    tx.delete(wallets).where(inArray(wallets.ownerId, demoUserIds)).run();
    tx.delete(categories).where(inArray(categories.userId, demoUserIds)).run();
    tx.delete(sessions).where(inArray(sessions.userId, demoUserIds)).run();
    tx.delete(users).where(inArray(users.id, demoUserIds)).run();
  });

  return ensureDemoSeeded(db);
}
