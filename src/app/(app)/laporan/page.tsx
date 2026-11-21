import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportsClient } from "@/components/reports-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getFinancialReport } from "@/lib/reports";
import { resolveReportPeriodRange } from "@/lib/view-helpers";
import { listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Laporan Keuangan",
};

export const dynamic = "force-dynamic";

export default async function LaporanPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const db = await getDb();
  const { from, to } = resolveReportPeriodRange("this_month");
  const [initialReport, initialWallets] = await Promise.all([
    getFinancialReport(db, user.id, {
      from,
      to,
      scope: "all",
    }),
    listUserWallets(db, user.id),
  ]);

  return (
    <ReportsClient
      initialFrom={from}
      initialTo={to}
      initialReport={initialReport}
      initialWallets={initialWallets}
    />
  );
}
