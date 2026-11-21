import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WalletsClient } from "@/components/wallets-client";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dompet & Keluarga",
};

export const dynamic = "force-dynamic";

export default async function DompetPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  return <WalletsClient currentUserId={user.id} />;
}
