import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WalletsClient } from "@/components/wallets-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listPendingInvitesForEmail, listUserWallets } from "@/lib/wallets";

export const metadata: Metadata = {
  title: "Dompet & Keluarga",
};

export const dynamic = "force-dynamic";

export default async function DompetPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const db = await getDb();
  const [initialWallets, initialInvites] = await Promise.all([
    listUserWallets(db, user.id, { includeArchived: true }),
    listPendingInvitesForEmail(db, user.email),
  ]);

  return (
    <WalletsClient
      currentUserId={user.id}
      initialWallets={initialWallets}
      initialInvites={initialInvites}
    />
  );
}
