import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { PublicSplitBillClient } from "@/components/public-split-bill-client";
import { formatIDR } from "@/lib/format";
import { getPublicSplitBillBySlug } from "@/lib/split-bills";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const bill = await getPublicSplitBillBySlug(db, slug);
  if (!bill) {
    return { title: "Patungan Tidak Ditemukan · ArusKas" };
  }
  return {
    title: `Patungan ${bill.title} (${formatIDR(bill.totalAmount)}) · ArusKas`,
    description: `Rincian patungan ${bill.title} untuk ${bill.totalCount} orang. ${bill.paidCount} sudah lunas.`,
  };
}

export default async function PublicSplitBillPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await getDb();
  const bill = await getPublicSplitBillBySlug(db, slug);

  if (!bill) {
    notFound();
  }

  return <PublicSplitBillClient bill={bill} />;
}
