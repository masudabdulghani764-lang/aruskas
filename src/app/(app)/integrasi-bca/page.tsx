import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BcaIntegrationClient } from "@/components/bca-integration-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getBcaIntegration } from "@/lib/bca-integration";
import { listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Auto-Catat Bank & E-Wallet",
};

export const dynamic = "force-dynamic";

export default async function IntegrasiBcaPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const db = await getDb();
  const [{ integration, logs }, allWallets] = await Promise.all([
    getBcaIntegration(db, user.id),
    listUserWallets(db, user.id),
  ]);
  const writableWallets = allWallets.filter(
    (w) => w.role === "owner" || w.role === "editor"
  );

  return (
    <BcaIntegrationClient
      initialIntegration={integration}
      initialLogs={logs}
      initialWallets={writableWallets}
    />
  );
}
