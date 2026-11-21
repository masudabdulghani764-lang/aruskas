import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BudgetsGoalsClient } from "@/components/budgets-goals-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listMonthlyBudgets } from "@/lib/budgets";
import { listCategories } from "@/lib/categories";
import { getCurrentMonthYM } from "@/lib/format";
import { listSavingsGoals } from "@/lib/goals";
import { listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Anggaran & Target",
};

export const dynamic = "force-dynamic";

export default async function AnggaranPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const db = getDb();
  const initialMonth = getCurrentMonthYM();
  const initialBudgets = listMonthlyBudgets(db, user.id, initialMonth);
  const initialGoals = listSavingsGoals(db, user.id);
  const initialExpenseCategories = listCategories(db, user.id, {
    type: "expense",
  });
  const initialWallets = listUserWallets(db, user.id);

  return (
    <BudgetsGoalsClient
      initialMonth={initialMonth}
      initialBudgets={initialBudgets}
      initialGoals={initialGoals}
      initialExpenseCategories={initialExpenseCategories}
      initialWallets={initialWallets}
    />
  );
}
