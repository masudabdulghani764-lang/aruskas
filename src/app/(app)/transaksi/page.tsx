import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TransactionsClient } from "@/components/transactions-client";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Buku Transaksi",
};

export const dynamic = "force-dynamic";

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

  return (
    <TransactionsClient initialTab={initialTab} currentUserId={user.id} />
  );
}
