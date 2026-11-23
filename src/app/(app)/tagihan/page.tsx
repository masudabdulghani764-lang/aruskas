import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BillsClient } from "@/components/bills-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { getCurrentMonthYM } from "@/lib/format";
import { listRecurringRules } from "@/lib/recurring";
import { listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Tagihan Bulanan",
};

export const dynamic = "force-dynamic";

export default async function TagihanPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const db = await getDb();
  const [initialRules, initialExpenseCategories, initialWallets] =
    await Promise.all([
      listRecurringRules(db, user.id),
      listCategories(db, user.id, { type: "expense" }),
      listUserWallets(db, user.id),
    ]);

  return (
    <BillsClient
      initialMonth={getCurrentMonthYM()}
      initialRules={initialRules}
      initialExpenseCategories={initialExpenseCategories}
      initialWallets={initialWallets}
    />
  );
}
