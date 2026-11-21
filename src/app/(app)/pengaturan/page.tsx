import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings-client";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listCategories } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Pengaturan",
};

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/masuk");
  }

  const initialCategories = listCategories(getDb(), user.id);

  return (
    <SettingsClient
      initialUser={user}
      initialCategories={initialCategories}
    />
  );
}
