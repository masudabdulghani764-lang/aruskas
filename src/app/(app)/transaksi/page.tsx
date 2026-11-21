import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TransactionsClient } from "@/components/transactions-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { getCurrentMonthYM } from "@/lib/format";
import { listRecurringRules } from "@/lib/recurring";
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
    resolvedParams.tab === "recurring" ? "recurring" : "history";

  const db = getDb();
  const currentYM = getCurrentMonthYM();
  const initialFrom = `${currentYM}-01`;
  const initialTo = getMonthEndISO(currentYM);

  const initialWallets = listUserWallets(db, user.id);
  const initialCategories = listCategories(db, user.id).map((c) => ({
    id: c.id,
    userId: c.userId,
    name: c.name,
    type: c.type,
    color: c.color,
  }));
  const initialTx = listTransactions(db, user.id, {
    from: initialFrom,
    to: initialTo,
  });
  const initialRules = listRecurringRules(db, user.id);

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
    />
  );
}
