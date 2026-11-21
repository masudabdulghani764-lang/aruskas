import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/reports";

export const metadata: Metadata = {
  title: "Ringkasan",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const initialData = await getDashboardSummary(
    await getDb(),
    user.id,
    user.email,
    {
      scope: "all",
    }
  );

  return <DashboardClient initialData={initialData} userName={user.name} />;
}
