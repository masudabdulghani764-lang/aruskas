"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Landmark,
  Share2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, cn } from "@/components/ui/primitives";
import { formatDateID, formatIDR } from "@/lib/format";
import type { PublicSplitBillView } from "@/lib/split-bills";

export function PublicSplitBillClient({
  bill,
}: {
  bill: PublicSplitBillView;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const progressPct =
    bill.totalAmount > 0
      ? Math.min(100, Math.round((bill.paidAmount / bill.totalAmount) * 100))
      : 0;

  async function copyText(key: string, text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} berhasil disalin.`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Gagal menyalin ke clipboard.");
    }
  }

  function handleShareWhatsApp() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const lines = [
      `Rincian Patungan *${bill.title}*`,
      `Total: ${formatIDR(bill.totalAmount)}`,
      "",
      ...bill.participants.map(
        (p) => `${p.isPaid ? "✅" : "⏳"} ${p.name}: ${formatIDR(p.amount)}`
      ),
    ];
    if (bill.bankName || bill.accountNumber) {
      lines.push(
        "",
        `Transfer ke: ${[bill.bankName, bill.accountNumber, bill.accountHolder ? `a.n. ${bill.accountHolder}` : ""].filter(Boolean).join(" · ")}`
      );
    }
    if (url) {
      lines.push("", `Cek status patungan: ${url}`);
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div className="min-h-screen bg-cream-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl space-y-5">
        {/* Top Brand Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-[#14532D]"
          >
            ArusKas.
          </Link>
          <Badge variant="forest">Patungan Publik</Badge>
        </div>

        {/* Hero Summary Card */}
        <div
          className="rounded-3xl border border-[#245A3E] p-6 sm:p-7 text-[#FAF8F4] shadow-sm space-y-4"
          style={{
            backgroundImage:
              "radial-gradient(circle at 90% 10%, rgba(229, 184, 105, 0.22) 0%, rgba(229, 184, 105, 0) 55%), linear-gradient(135deg, #14532D 0%, #113B26 55%, #0D2E1D 100%)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#E5B869]">
            <span className="font-semibold uppercase tracking-wider">
              Dibuat oleh {bill.creatorName}
            </span>
            <span className="tnum text-[#C6DDD0]">
              {formatDateID(bill.occurredAt)}
            </span>
          </div>

          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#FFFFFF]">
              {bill.title}
            </h1>
            <p className="tnum font-display mt-2 text-4xl font-semibold text-[#FFFFFF]">
              {formatIDR(bill.totalAmount)}
            </p>
          </div>

          {/* Payment Progress */}
          <div className="space-y-2 pt-2 border-t border-[#2E6F4E]/80">
            <div className="flex items-center justify-between text-xs text-[#D6EAE0]">
              <span>
                Terkumpul{" "}
                <strong className="tnum text-[#FFFFFF]">
                  {formatIDR(bill.paidAmount)}
                </strong>{" "}
                ({bill.paidCount}/{bill.totalCount} orang)
              </span>
              <span className="tnum font-semibold text-[#E5B869]">
                {progressPct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#0A2417]">
              <div
                className="h-full rounded-full bg-[#86EFAC]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {bill.unpaidAmount > 0 && (
              <p className="text-[11px] text-[#C6DDD0]">
                Sisa belum dibayar:{" "}
                <span className="tnum font-semibold text-[#FFFFFF]">
                  {formatIDR(bill.unpaidAmount)}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Transfer Destination Card */}
        {(bill.bankName || bill.accountNumber || bill.accountHolder) && (
          <Card padding="md" className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#57534E]">
              <Landmark className="h-4 w-4 text-[#14532D]" />
              <span>Rekening / Tujuan Transfer</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E3D4BA] bg-[#FAF1E0] px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-[#14532D]">
                  {bill.bankName ?? "Transfer / E-Wallet"}
                </p>
                {bill.accountNumber && (
                  <p className="tnum mt-0.5 text-lg font-bold tracking-wide text-[#1C1917]">
                    {bill.accountNumber}
                  </p>
                )}
                {bill.accountHolder && (
                  <p className="text-xs text-[#57534E]">
                    a.n. {bill.accountHolder}
                  </p>
                )}
              </div>
              {bill.accountNumber && (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    void copyText(
                      "rek",
                      bill.accountNumber!,
                      "Nomor rekening"
                    )
                  }
                >
                  {copiedKey === "rek" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedKey === "rek" ? "Disalin" : "Salin No."}</span>
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Participants List */}
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
              <Users className="h-4 w-4 text-[#14532D]" />
              <span>Rincian Per Orang</span>
            </div>
            <span className="text-xs text-[#78716C]">
              {bill.paidCount} dari {bill.totalCount} lunas
            </span>
          </div>

          <div className="divide-y divide-[#EDE5D6]">
            {bill.participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {p.isPaid ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
                  ) : (
                    <Clock className="h-4 w-4 shrink-0 text-[#B45309]" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold",
                        p.isPaid ? "text-[#14532D]" : "text-[#1C1917]"
                      )}
                    >
                      {p.name}
                    </p>
                    <p className="text-[11px] text-[#78716C]">
                      {p.isPaid ? "Sudah lunas" : "Menunggu pembayaran"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="tnum text-sm font-bold text-[#1C1917]">
                    {formatIDR(p.amount)}
                  </span>
                  <Badge variant={p.isPaid ? "inflow" : "warning"}>
                    {p.isPaid ? "Lunas" : "Belum"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {bill.notes && (
            <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF1E0]/70 px-3.5 py-2.5 text-xs text-[#57534E]">
              <strong className="text-[#1C1917]">Catatan:</strong> {bill.notes}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1"
              onClick={handleShareWhatsApp}
            >
              <Share2 className="h-4 w-4" />
              <span>Bagikan ke WhatsApp</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() =>
                void copyText(
                  "link",
                  typeof window !== "undefined" ? window.location.href : "",
                  "Link patungan"
                )
              }
            >
              {copiedKey === "link" ? (
                <Check className="h-4 w-4 text-[#15803D]" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span>Salin Link</span>
            </Button>
          </div>
        </Card>

        {/* Viral Organic Growth CTA */}
        <div className="rounded-2xl border border-[#E3D4BA] bg-[#FFFFFF] p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1C1917]">
              Mau atur keuangan &amp; patungan otomatis seperti ini?
            </p>
            <p className="text-xs text-[#78716C] mt-0.5">
              Catat arus kas pribadi, dompet keluarga, &amp; notifikasi bank otomatis di ArusKas — gratis.
            </p>
          </div>
          <Link
            href="/daftar"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#14532D] px-4 text-xs font-semibold text-[#FFFFFF] transition-colors hover:bg-[#166534]"
          >
            <span>Coba Gratis</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
