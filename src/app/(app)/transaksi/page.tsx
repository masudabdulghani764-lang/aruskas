import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TransactionsClient } from "@/components/transactions-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { listUserDebts } from "@/lib/debts";
import { getCurrentMonthYM } from "@/lib/format";
import { listRecurringRules } from "@/lib/recurring";
import { listUserSplitBills } from "@/lib/split-bills";
import { listTransactions } from "@/lib/transactions";
import { listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Buku Transaksi",
};

export const dynamic = "force-dynamic";

function getMonthEndISO(ym: string): string {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(lastDay).padStart(2, "0")}`;
}

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const resolvedParams = await searchParams;
  const initialTab =
    resolvedParams.tab === "recurring"
      ? "recurring"
      : resolvedParams.tab === "patungan"
        ? "patungan"
        : resolvedParams.tab === "hutang"
          ? "hutang"
          : "history";

  const db = await getDb();
  const currentYM = getCurrentMonthYM();
  const initialFrom = `${currentYM}-01`;
  const initialTo = getMonthEndISO(currentYM);

  const [
    initialWallets,
    rawCategories,
    initialTx,
    initialRules,
    initialSplitBills,
    initialDebtsRes,
  ] = await Promise.all([
    listUserWallets(db, user.id),
    listCategories(db, user.id),
    listTransactions(db, user.id, {
      from: initialFrom,
      to: initialTo,
    }),
    listRecurringRules(db, user.id),
    listUserSplitBills(db, user.id),
    listUserDebts(db, user.id),
  ]);
  const initialCategories = rawCategories.map((c) => ({
    id: c.id,
    userId: c.userId,
    name: c.name,
    type: c.type,
    color: c.color,
  }));

  return (
    <TransactionsClient
      initialTab={initialTab}
      currentUserId={user.id}
      initialFrom={initialFrom}
      initialTo={initialTo}
      initialWallets={initialWallets}
      initialCategories={initialCategories}
      initialItems={initialTx.items}
      initialSummary={initialTx.summary}
      initialRules={initialRules}
      initialSplitBills={initialSplitBills}
      initialDebts={initialDebtsRes.items}
    />
  );
}
