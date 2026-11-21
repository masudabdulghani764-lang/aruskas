import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BcaIntegrationClient } from "@/components/bca-integration-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getBcaIntegration } from "@/lib/bca-integration";
import { listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Otomatisasi Bank BCA",
};

export const dynamic = "force-dynamic";

export default async function IntegrasiBcaPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const db = getDb();
  const { integration, logs } = getBcaIntegration(db, user.id);
  const writableWallets = listUserWallets(db, user.id).filter(
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
