"use client";

import React, { useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Users,
} from "lucide-react";

type PreviewTab = "cashflow" | "family" | "budget";

const MONTHLY_BARS = [
  { label: "Jun", inPct: 68, outPct: 48 },
  { label: "Jul", inPct: 74, outPct: 54 },
  { label: "Agu", inPct: 71, outPct: 50 },
  { label: "Sep", inPct: 82, outPct: 58 },
  { label: "Okt", inPct: 79, outPct: 52 },
  { label: "Nov", inPct: 92, outPct: 60 },
] as const;

const SAMPLE_TX = [
  {
    title: "Gaji Bulanan",
    meta: "BCA Utama · 1 Nov",
    amount: "+Rp 14.500.000",
    color: "text-[#15803D]",
    bg: "bg-[#DCFCE7] text-[#14532D]",
    icon: ArrowDownLeft,
  },
  {
    title: "Belanja Mingguan Dapur",
    meta: "Kas Rumah Tangga · Nadia",
    amount: "-Rp 645.000",
    color: "text-[#B91C1C]",
    bg: "bg-[#FEE2E2] text-[#991B1B]",
    icon: ArrowUpRight,
  },
  {
    title: "Setoran Dana Darurat",
    meta: "BCA Utama → Tabungan",
    amount: "Rp 2.500.000",
    color: "text-[#44403C]",
    bg: "bg-[#EFECE4] text-[#57534E]",
    icon: ArrowLeftRight,
  },
] as const;

export function LandingShowcase() {
  const [tab, setTab] = useState<PreviewTab>("cashflow");

  return (
    <div className="relative">
      {/* Subtle warm botanical backdrop frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-3 rounded-[28px] bg-gradient-to-br from-[#DCFCE7]/55 via-[#FEF3C7]/45 to-[#FFEDD5]/45 blur-md"
      />

      <div className="relative overflow-hidden rounded-2xl border border-[#DDD5C7] bg-[#FFFFFF] shadow-[0_12px_40px_rgba(20,83,45,0.08)]">
        {/* Top editorial bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E2D8] bg-[#FAF8F4] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#14532D]" />
            <span className="text-xs font-semibold tracking-wide text-[#1C1917]">
              Pratinjau Interaktif
            </span>
          </div>
          <div
            className="inline-flex rounded-lg border border-[#E7E2D8] bg-[#EFECE4] p-0.5 text-xs"
            role="tablist"
            aria-label="Pilih pratinjau fitur ArusKas"
          >
            {(
              [
                { key: "cashflow", label: "Arus Kas" },
                { key: "family", label: "Keluarga" },
                { key: "budget", label: "Anggaran" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  tab === item.key
                    ? "bg-[#14532D] text-[#FFFFFF]"
                    : "text-[#57534E] hover:text-[#1C1917]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {tab === "cashflow" && (
            <div className="space-y-5">
              {/* Hero Balance */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#78716C]">
                    Total Saldo Aktif (4 Dompet)
                  </p>
                  <p className="font-display tnum mt-1 text-3xl font-medium tracking-tight text-[#1C1917] sm:text-[34px]">
                    Rp 31.450.000
                  </p>
                  <p className="mt-1 text-xs text-[#78716C]">
                    Termasuk Kas Rumah Tangga ·{" "}
                    <span className="tnum font-semibold text-[#15803D]">
                      +8,4%
                    </span>{" "}
                    vs bulan lalu
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#FDE68A] bg-[#FEF3C7] px-2.5 py-1 text-xs font-semibold text-[#92400E] tnum">
                  Rasio Menabung 34%
                </span>
              </div>

              {/* Inflow vs Outflow strip */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#CBE7D5] bg-[#F2FAF5] p-3.5">
                  <p className="text-xs font-medium text-[#166534]">
                    Uang Masuk · Nov
                  </p>
                  <p className="tnum mt-1 text-base font-semibold text-[#15803D] sm:text-lg">
                    +Rp 18.200.000
                  </p>
                </div>
                <div className="rounded-xl border border-[#F5D0C5] bg-[#FEF6F3] p-3.5">
                  <p className="text-xs font-medium text-[#9A3412]">
                    Uang Keluar · Nov
                  </p>
                  <p className="tnum mt-1 text-base font-semibold text-[#B91C1C] sm:text-lg">
                    -Rp 11.980.000
                  </p>
                </div>
              </div>

              {/* Mini 6-month cashflow bars */}
              <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] p-3.5">
                <div className="mb-2.5 flex items-center justify-between text-[11px] text-[#78716C]">
                  <span className="font-semibold uppercase tracking-wider">
                    Tren 6 Bulan
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#15803D]" />
                      Masuk
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#D97706]" />
                      Keluar
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-6 items-end gap-2 h-20 pt-2">
                  {MONTHLY_BARS.map((m) => (
                    <div
                      key={m.label}
                      className="flex flex-col items-center gap-1.5 h-full justify-end"
                    >
                      <div className="flex items-end gap-1 h-14 w-full justify-center">
                        <div
                          className="w-2.5 rounded-t bg-[#15803D]"
                          style={{ height: `${m.inPct}%` }}
                        />
                        <div
                          className="w-2.5 rounded-t bg-[#D97706]/85"
                          style={{ height: `${m.outPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[#78716C] tnum">
                        {m.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Latest rows */}
              <ul className="divide-y divide-[#EFECE4]">
                {SAMPLE_TX.map((tx) => {
                  const Icon = tx.icon;
                  return (
                    <li
                      key={tx.title}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tx.bg}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#1C1917]">
                            {tx.title}
                          </p>
                          <p className="truncate text-xs text-[#78716C] tnum">
                            {tx.meta}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`tnum shrink-0 text-sm font-semibold ${tx.color}`}
                      >
                        {tx.amount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === "family" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#B45309]">
                    Kolaborasi Tanpa Kehilangan Privasi
                  </p>
                  <p className="font-display mt-0.5 text-xl font-medium text-[#1C1917]">
                    Dompet Pribadi &amp; Kas Keluarga
                  </p>
                </div>
                <Users className="h-5 w-5 text-[#14532D]" />
              </div>

              <div className="space-y-2.5">
                <div className="rounded-xl border border-[#CBE7D5] bg-[#F2FAF5] p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-[#14532D]" />
                      <span className="text-sm font-semibold text-[#1C1917]">
                        Kas Rumah Tangga
                      </span>
                    </div>
                    <span className="rounded-full bg-[#14532D] px-2 py-0.5 text-[11px] font-medium text-white">
                      Dompet Bersama · 2 Anggota
                    </span>
                  </div>
                  <p className="font-display tnum mt-2 text-2xl font-medium text-[#1C1917]">
                    Rp 8.420.000
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs text-[#57534E]">
                    <span>Raka (Pemilik) · Nadia (Editor)</span>
                    <span className="text-[#15803D] font-medium">
                      Tercatat per pencatat
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[#57534E]" />
                      <span className="text-sm font-semibold text-[#1C1917]">
                        BCA Utama (Pribadi)
                      </span>
                    </div>
                    <span className="rounded-full border border-[#DDD5C7] bg-[#FFFFFF] px-2 py-0.5 text-[11px] font-medium text-[#57534E]">
                      Privat
                    </span>
                  </div>
                  <p className="font-display tnum mt-1.5 text-xl font-medium text-[#1C1917]">
                    Rp 19.650.000
                  </p>
                  <p className="mt-1 text-xs text-[#78716C]">
                    Transfer ke kas bersama otomatis menyamarkan nama rekening
                    pribadi.
                  </p>
                </div>

                <div className="rounded-xl border border-[#EADBC0] bg-[#FDF8EE] p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PiggyBank className="h-4 w-4 text-[#B45309]" />
                      <span className="text-sm font-semibold text-[#1C1917]">
                        Tabungan Liburan Nadia
                      </span>
                    </div>
                    <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                      Pemantau (Viewer)
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#78716C]">
                    Dipisahkan di bagian Dompet Dipantau agar tidak bercampur
                    dengan saldo pribadi Anda.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "budget" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#14532D]">
                  Kendali Pengeluaran &amp; Target
                </p>
                <p className="font-display mt-0.5 text-xl font-medium text-[#1C1917]">
                  Anggaran November 2026
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    name: "Makanan & Minuman",
                    used: "Rp 2.220.000 / Rp 3.000.000",
                    pct: 74,
                    status: "Aman",
                    bar: "bg-[#15803D]",
                    badge: "bg-[#DCFCE7] text-[#14532D]",
                  },
                  {
                    name: "Tagihan & Utilitas",
                    used: "Rp 1.760.000 / Rp 2.000.000",
                    pct: 88,
                    status: "Waspada",
                    bar: "bg-[#D97706]",
                    badge: "bg-[#FEF3C7] text-[#92400E]",
                  },
                  {
                    name: "Belanja Rumah Tangga",
                    used: "Rp 1.650.000 / Rp 2.500.000",
                    pct: 66,
                    status: "Aman",
                    bar: "bg-[#15803D]",
                    badge: "bg-[#DCFCE7] text-[#14532D]",
                  },
                ].map((b) => (
                  <div
                    key={b.name}
                    className="rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#1C1917]">
                        {b.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tnum ${b.badge}`}
                      >
                        {b.pct}% · {b.status}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E7E2D8]">
                      <div
                        className={`h-full rounded-full ${b.bar}`}
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#78716C] tnum">
                      {b.used}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#296346] bg-[#113B26] p-4 text-[#F7F5F0]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#E5B869]">
                    Target Tabungan · Dana Darurat
                  </span>
                  <span className="tnum font-semibold text-[#86EFAC]">78%</span>
                </div>
                <p className="font-display tnum mt-1 text-xl font-medium">
                  Rp 19.500.000{" "}
                  <span className="text-xs font-sans text-[#B8D4C5]">
                    / Rp 25.000.000
                  </span>
                </p>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#1D5438]">
                  <div className="h-full w-[78%] rounded-full bg-[#E5B869]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
