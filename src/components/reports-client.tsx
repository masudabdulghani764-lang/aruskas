"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Printer,
  ReceiptText,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
  SkeletonCard,
  cn,
} from "@/components/ui/primitives";
import { formatDateID, formatIDR, getTodayISO } from "@/lib/format";
import type { CategoryBreakdownItem, FinancialReport } from "@/lib/reports";
import {
  type ReportPeriodPreset,
  buildReportQueryString,
  resolveReportPeriodRange,
} from "@/lib/view-helpers";
import type { WalletWithRole } from "@/lib/wallets";

interface ReportsClientProps {
  initialFrom: string;
  initialTo: string;
  initialReport: FinancialReport;
  initialWallets: WalletWithRole[];
}

const PRESET_OPTIONS: Array<{
  id: ReportPeriodPreset;
  label: string;
}> = [
  { id: "this_month", label: "Bulan Ini" },
  { id: "last_month", label: "Bulan Lalu" },
  { id: "this_quarter", label: "Kuartal Ini" },
  { id: "this_year", label: "Tahun Ini" },
  { id: "custom", label: "Kustom" },
];

const SHORT_MONTHS_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

function formatTrendAxisTick(period: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const monthIdx = Number(period.slice(5, 7)) - 1;
    const day = Number(period.slice(8, 10));
    return `${day} ${SHORT_MONTHS_ID[monthIdx] ?? ""}`;
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const monthIdx = Number(period.slice(5, 7)) - 1;
    return `${SHORT_MONTHS_ID[monthIdx] ?? period} '${period.slice(2, 4)}`;
  }
  return period;
}

function formatCompactAxisIDR(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) {
    return "Rp 0";
  }
  if (abs >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  }
  if (abs >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} jt`;
  }
  if (abs >= 1_000) {
    return `Rp ${Math.round(value / 1_000)} rb`;
  }
  return `Rp ${value}`;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: FinancialReport["trendSeries"][number];
  }>;
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0]?.payload;
  if (!entry) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(28,25,23,0.10)] text-xs">
      <p className="font-semibold text-[#1C1917] mb-1.5">{entry.label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 text-[#57534E]">
            <span className="h-2 w-2 rounded-full bg-[#15803D]" />
            Uang Masuk
          </span>
          <span className="tnum font-semibold text-[#15803D]">
            {formatIDR(entry.income)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 text-[#57534E]">
            <span className="h-2 w-2 rounded-full bg-[#B91C1C]" />
            Uang Keluar
          </span>
          <span className="tnum font-semibold text-[#B91C1C]">
            {formatIDR(entry.expense)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-5 border-t border-[#E7E2D8] pt-1 mt-1">
          <span className="text-[#78716C]">Selisih</span>
          <span
            className={cn(
              "tnum font-semibold",
              entry.net >= 0 ? "text-[#15803D]" : "text-[#B91C1C]"
            )}
          >
            {formatIDR(entry.net, { signed: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryBreakdownPanel({
  title,
  subtitle,
  items,
  emptyText,
}: {
  title: string;
  subtitle: React.ReactNode;
  items: CategoryBreakdownItem[];
  emptyText: string;
}) {
  return (
    <Card padding="md" className="print-sheet print:break-inside-avoid">
      <CardHeader serif title={title} subtitle={subtitle} />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E7E2D8] bg-[#F7F5F0]/50 px-4 py-8 text-center text-xs text-[#78716C]">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Proportion Bars */}
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.categoryId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full print:[print-color-adjust:exact]"
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <span className="truncate font-medium text-[#1C1917]">
                      {item.categoryName}
                    </span>
                  </div>
                  <span className="tnum shrink-0 font-medium text-[#57534E]">
                    {item.percentage}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                  <div
                    className="h-full rounded-full print:[print-color-adjust:exact]"
                    style={{
                      width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                      backgroundColor: item.categoryColor,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Category Summary Table */}
          <div className="overflow-x-auto border-t border-[#E7E2D8] pt-3">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7E2D8] text-[#78716C]">
                  <th className="py-2 pr-2 font-medium">Kategori</th>
                  <th className="py-2 px-2 text-right font-medium">Transaksi</th>
                  <th className="py-2 px-2 text-right font-medium">Porsi</th>
                  <th className="py-2 pl-2 text-right font-medium">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E2D8]">
                {items.map((item) => (
                  <tr key={item.categoryId}>
                    <td className="py-2 pr-2 font-medium text-[#1C1917]">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full print:[print-color-adjust:exact]"
                          style={{ backgroundColor: item.categoryColor }}
                        />
                        <span>{item.categoryName}</span>
                      </span>
                    </td>
                    <td className="tnum py-2 px-2 text-right text-[#57534E]">
                      {item.count}
                    </td>
                    <td className="tnum py-2 px-2 text-right text-[#57534E]">
                      {item.percentage}%
                    </td>
                    <td className="tnum py-2 pl-2 text-right font-semibold text-[#1C1917]">
                      {formatIDR(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Laporan Keuangan client view with period presets, wallet scope selection,
 * reconciled accounting statement, Recharts trend & category breakdown,
 * RFC 4180 CSV export, and clean A4 print-to-PDF layout.
 */
export function ReportsClient({
  initialFrom,
  initialTo,
  initialReport,
  initialWallets,
}: ReportsClientProps) {
  const { refreshTrigger } = useQuickAdd();

  const [preset, setPreset] = useState<ReportPeriodPreset>("this_month");
  const [customFrom, setCustomFrom] = useState(initialFrom);
  const [customTo, setCustomTo] = useState(initialTo);
  const [walletSelection, setWalletSelection] = useState("scope:all");

  const [report, setReport] = useState<FinancialReport>(initialReport);
  const [wallets, setWallets] = useState<WalletWithRole[]>(initialWallets);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [chartMounted, setChartMounted] = useState(false);
  const [printedDate, setPrintedDate] = useState(() => formatDateID(initialTo));

  const hasHydratedRef = useRef(true);
  const hasLeftInitialStateRef = useRef(false);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setChartMounted(true);
    setPrintedDate(formatDateID(getTodayISO()));
  }, []);

  const activeRange = useMemo(
    () => ({ from: customFrom, to: customTo }),
    [customFrom, customTo]
  );

  const dateRangeInvalid =
    !activeRange.from ||
    !activeRange.to ||
    activeRange.from > activeRange.to;

  const queryString = useMemo(
    () =>
      buildReportQueryString({
        from: activeRange.from,
        to: activeRange.to,
        walletSelection,
      }),
    [activeRange.from, activeRange.to, walletSelection]
  );

  const fetchReportAndWallets = useCallback(
    async (qs: string, rangeInvalid: boolean, background: boolean) => {
      abortRef.current?.abort();
      const seq = ++seqRef.current;

      if (rangeInvalid) {
        setFetchError(
          !activeRange.from || !activeRange.to
            ? "Pilih tanggal awal dan tanggal akhir yang valid."
            : "Tanggal awal tidak boleh melebihi tanggal akhir."
        );
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setFetchError(null);

      try {
        const [reportRes, walletsRes] = await Promise.all([
          fetch(`/api/reports?${qs}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/wallets", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        const [reportData, walletsData] = await Promise.all([
          reportRes.json().catch(() => ({})),
          walletsRes.json().catch(() => ({})),
        ]);

        if (controller.signal.aborted || seq !== seqRef.current) {
          return;
        }

        if (!reportRes.ok) {
          throw new Error(reportData.error ?? "Gagal memuat laporan keuangan.");
        }

        setReport(reportData as FinancialReport);
        if (walletsRes.ok && Array.isArray(walletsData.wallets)) {
          setWallets(walletsData.wallets as WalletWithRole[]);
        }
        hasHydratedRef.current = true;
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError") ||
          seq !== seqRef.current
        ) {
          return;
        }
        const msg =
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat memuat laporan keuangan.";
        setFetchError(msg);
        toast.error(msg);
      } finally {
        if (!controller.signal.aborted && seq === seqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [activeRange.from, activeRange.to]
  );

  useEffect(() => {
    if (
      !hasLeftInitialStateRef.current &&
      preset === "this_month" &&
      walletSelection === "scope:all" &&
      activeRange.from === initialFrom &&
      activeRange.to === initialTo &&
      refreshTrigger === 0
    ) {
      return;
    }
    hasLeftInitialStateRef.current = true;
    void fetchReportAndWallets(
      queryString,
      dateRangeInvalid,
      hasHydratedRef.current
    );
    return () => {
      abortRef.current?.abort();
    };
  }, [
    preset,
    walletSelection,
    activeRange.from,
    activeRange.to,
    initialFrom,
    initialTo,
    queryString,
    dateRangeInvalid,
    refreshTrigger,
    fetchReportAndWallets,
  ]);

  function handleSelectPreset(nextPreset: ReportPeriodPreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") {
      const resolved = resolveReportPeriodRange(nextPreset);
      setCustomFrom(resolved.from);
      setCustomTo(resolved.to);
    }
  }

  const scopeLabel = useMemo(() => {
    if (report.isSingleWallet && report.walletName) {
      return `Dompet: ${report.walletName}`;
    }
    return report.scope === "personal"
      ? "Dompet Pribadi Saja"
      : "Semua Dompet Aktif";
  }, [report.isSingleWallet, report.walletName, report.scope]);

  const showTransfers =
    report.isSingleWallet || report.transferIn > 0 || report.transferOut > 0;

  const csvExportUrl = `/api/reports/export/csv?${queryString}`;

  return (
    <div className="space-y-6 print:space-y-5">
      {/* Screen Header (hidden on print because A4 Kop takes over) */}
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#78716C]">
            Pembukuan &amp; Ekspor
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Laporan Keuangan
          </h1>
          <p className="mt-1 text-sm text-[#78716C]">
            Rekonsiliasi saldo awal ke saldo akhir, tren arus kas, breakdown
            kategori, serta ekspor CSV &amp; cetak PDF A4.
          </p>
        </div>

        <p className="tnum text-xs sm:text-sm text-[#78716C]">
          {formatDateID(report.from)} – {formatDateID(report.to)}
          {refreshing ? " · Memperbarui..." : ""}
        </p>
      </div>

      {/* Formal A4 Print Header (Kop Laporan Cetak) */}
      <header className="hidden print:block border-b-2 border-[#14532D] pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#14532D]">
              Laporan Resmi ArusKas
            </p>
            <h1 className="font-display text-2xl font-semibold text-[#1C1917] mt-0.5">
              ArusKas — Laporan Arus Kas Keuangan
            </h1>
          </div>
          <div className="text-right text-xs text-[#57534E] space-y-0.5">
            <p className="tnum font-medium text-[#1C1917]">
              Periode: {formatDateID(report.from)} – {formatDateID(report.to)}
            </p>
            <p>Cakupan: {scopeLabel}</p>
            <p className="tnum">Dicetak: {printedDate}</p>
          </div>
        </div>
      </header>

      {/* Control Bar (.no-print) */}
      <Card padding="md" className="no-print space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            {/* Period Presets */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-[#57534E]">
                Periode Laporan
              </span>
              <div
                role="group"
                aria-label="Preset periode laporan"
                className="inline-flex flex-wrap gap-1.5 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-1"
              >
                {PRESET_OPTIONS.map((item) => {
                  const active = preset === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectPreset(item.id)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                          : "text-[#57534E] hover:text-[#1C1917]"
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Date Inputs */}
            {preset === "custom" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-md">
                <Input
                  label="Dari Tanggal"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <Input
                  label="Sampai Tanggal"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Select
              label="Cakupan Dompet"
              wrapperClassName="min-w-[230px]"
              value={walletSelection}
              onChange={(e) => setWalletSelection(e.target.value)}
            >
              <option value="scope:all">Semua Dompet Aktif</option>
              <option value="scope:personal">Dompet Pribadi Saja</option>
              {wallets.length > 0 && (
                <optgroup label="Dompet Spesifik">
                  {wallets.map((w) => {
                    const roleTag =
                      w.role === "viewer"
                        ? "Dipantau"
                        : w.isShared
                          ? "Bersama"
                          : "Pribadi";
                    return (
                      <option key={w.id} value={`wallet:${w.id}`}>
                        {w.name} ({roleTag})
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </Select>

            <div className="flex flex-wrap items-center gap-2">
              {dateRangeInvalid ? (
                <Button variant="secondary" size="md" disabled>
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Ekspor CSV</span>
                </Button>
              ) : (
                <a
                  href={csvExportUrl}
                  download
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4] hover:border-[#D6CFC2] whitespace-nowrap"
                >
                  <Download className="h-4 w-4 text-[#14532D]" />
                  <span>Ekspor CSV</span>
                </a>
              )}

              <Button
                variant="primary"
                size="md"
                disabled={dateRangeInvalid}
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                <span>Cetak / Simpan PDF</span>
              </Button>
            </div>
          </div>
        </div>

        {fetchError && (
          <div
            role="alert"
            className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
          >
            {fetchError}
          </div>
        )}
      </Card>

      {loading ? (
        <div className="space-y-6">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={5} />
        </div>
      ) : (
        <div
          className={cn(
            "space-y-6 print:space-y-5 transition-opacity",
            refreshing && "opacity-65"
          )}
        >
          {/* Ringkasan Eksekutif Arus Kas (Statement Table) */}
          <Card padding="md" className="print-sheet print:break-inside-avoid">
            <CardHeader
              serif
              title="Ringkasan Eksekutif Arus Kas"
              subtitle={
                <>
                  Posisi keuangan terverifikasi untuk {scopeLabel} (
                  <span className="tnum">
                    {formatDateID(report.from)} – {formatDateID(report.to)}
                  </span>
                  )
                </>
              }
              action={
                <Badge variant="neutral">
                  <span className="tnum">
                    {report.transactionCount} transaksi
                  </span>
                </Badge>
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[#E7E2D8]">
                  <tr>
                    <td className="py-2.5 pr-4 text-[#57534E]">
                      Saldo Awal Periode
                    </td>
                    <td className="tnum py-2.5 pl-4 text-right font-medium text-[#1C1917]">
                      {formatIDR(report.openingBalance)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-4 text-[#57534E]">
                      Total Uang Masuk
                    </td>
                    <td className="tnum py-2.5 pl-4 text-right font-semibold text-[#15803D]">
                      {report.totalIncome > 0
                        ? formatIDR(report.totalIncome, { signed: true })
                        : formatIDR(0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-4 text-[#57534E]">
                      Total Uang Keluar
                    </td>
                    <td className="tnum py-2.5 pl-4 text-right font-semibold text-[#B91C1C]">
                      {report.totalExpense > 0
                        ? formatIDR(-report.totalExpense, { signed: true })
                        : formatIDR(0)}
                    </td>
                  </tr>

                  {showTransfers && (
                    <>
                      <tr>
                        <td className="py-2.5 pr-4 text-[#57534E]">
                          Transfer Masuk
                        </td>
                        <td
                          className={cn(
                            "tnum py-2.5 pl-4 text-right font-medium",
                            report.transferIn > 0
                              ? "text-[#15803D]"
                              : "text-[#57534E]"
                          )}
                        >
                          {report.transferIn > 0
                            ? formatIDR(report.transferIn, { signed: true })
                            : formatIDR(0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 text-[#57534E]">
                          Transfer Keluar
                        </td>
                        <td
                          className={cn(
                            "tnum py-2.5 pl-4 text-right font-medium",
                            report.transferOut > 0
                              ? "text-[#B91C1C]"
                              : "text-[#57534E]"
                          )}
                        >
                          {report.transferOut > 0
                            ? formatIDR(-report.transferOut, { signed: true })
                            : formatIDR(0)}
                        </td>
                      </tr>
                    </>
                  )}

                  <tr className="bg-[#F7F5F0]/55">
                    <td className="py-2.5 pr-4 font-medium text-[#1C1917]">
                      Perubahan Bersih
                    </td>
                    <td
                      className={cn(
                        "tnum py-2.5 pl-4 text-right font-semibold",
                        report.netChange >= 0
                          ? "text-[#15803D]"
                          : "text-[#B91C1C]"
                      )}
                    >
                      {formatIDR(report.netChange, { signed: true })}
                    </td>
                  </tr>

                  <tr className="border-t-2 border-[#14532D]/35 bg-[#F7F5F0]/80">
                    <td className="py-3 pr-4 font-display text-base sm:text-lg font-semibold text-[#1C1917]">
                      Saldo Akhir Periode
                    </td>
                    <td className="tnum font-display py-3 pl-4 text-right text-lg sm:text-xl font-semibold text-[#1C1917]">
                      {formatIDR(report.closingBalance)}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-4 text-[#57534E]">
                      Rasio Menabung (Saving Rate)
                    </td>
                    <td className="tnum py-2.5 pl-4 text-right">
                      <Badge
                        variant={
                          report.savingRate >= 20
                            ? "inflow"
                            : report.savingRate >= 0
                              ? "warning"
                              : "outflow"
                        }
                      >
                        <span className="tnum">{report.savingRate}%</span>
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Visualisasi Grafik Tren Arus Kas */}
          <Card padding="md" className="print-sheet print:break-inside-avoid">
            <CardHeader
              serif
              title="Tren Arus Kas Periode"
              subtitle="Perbandingan Uang Masuk dan Uang Keluar sepanjang rentang laporan"
              action={
                <div className="flex items-center gap-4 text-xs text-[#57534E]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#15803D]" />
                    Uang Masuk
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#B91C1C]" />
                    Uang Keluar
                  </span>
                </div>
              }
            />

            {report.trendSeries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E7E2D8] bg-[#F7F5F0]/50 px-4 py-10 text-center text-xs text-[#78716C]">
                Belum ada data tren arus kas pada rentang tanggal ini.
              </div>
            ) : (
              <div className="h-[260px] w-full min-w-0 print:h-[220px] print:overflow-hidden">
                {chartMounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={report.trendSeries}
                      margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="aruskasIncomeFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#15803D"
                            stopOpacity={0.22}
                          />
                          <stop
                            offset="95%"
                            stopColor="#15803D"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                        <linearGradient
                          id="aruskasExpenseFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#B91C1C"
                            stopOpacity={0.18}
                          />
                          <stop
                            offset="95%"
                            stopColor="#B91C1C"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="#E7E2D8"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tickFormatter={formatTrendAxisTick}
                        tick={{ fontSize: 11, fill: "#78716C" }}
                        axisLine={{ stroke: "#E7E2D8" }}
                        tickLine={false}
                        minTickGap={22}
                      />
                      <YAxis
                        tickFormatter={formatCompactAxisIDR}
                        tick={{ fontSize: 11, fill: "#78716C" }}
                        axisLine={false}
                        tickLine={false}
                        width={76}
                      />
                      <Tooltip content={<TrendTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="income"
                        name="Uang Masuk"
                        stroke="#15803D"
                        strokeWidth={2}
                        fill="url(#aruskasIncomeFill)"
                        isAnimationActive={false}
                        dot={report.trendSeries.length <= 16 ? { r: 2.5 } : false}
                      />
                      <Area
                        type="monotone"
                        dataKey="expense"
                        name="Uang Keluar"
                        stroke="#B91C1C"
                        strokeWidth={2}
                        fill="url(#aruskasExpenseFill)"
                        isAnimationActive={false}
                        dot={report.trendSeries.length <= 16 ? { r: 2.5 } : false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-xl bg-[#F7F5F0] animate-pulse" />
                )}
              </div>
            )}
          </Card>

          {/* Breakdown Kategori Pengeluaran & Pemasukan */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
            <CategoryBreakdownPanel
              title="Pengeluaran per Kategori"
              subtitle={
                <>
                  Total{" "}
                  <span className="tnum font-medium">
                    {formatIDR(report.totalExpense)}
                  </span>
                </>
              }
              items={report.expenseByCategory}
              emptyText="Belum ada transaksi pengeluaran pada periode ini."
            />
            <CategoryBreakdownPanel
              title="Pemasukan per Kategori"
              subtitle={
                <>
                  Total{" "}
                  <span className="tnum font-medium">
                    {formatIDR(report.totalIncome)}
                  </span>
                </>
              }
              items={report.incomeByCategory}
              emptyText="Belum ada transaksi pemasukan pada periode ini."
            />
          </div>

          {/* Ringkasan Daftar Transaksi Periode */}
          <Card padding="md" className="print-sheet">
            <CardHeader
              serif
              title="Daftar Transaksi Periode"
              subtitle={
                <>
                  Rincian lengkap{" "}
                  <span className="tnum font-medium">
                    {report.transactions.length}
                  </span>{" "}
                  transaksi untuk audit &amp; arsip
                </>
              }
            />

            {report.transactions.length === 0 ? (
              <EmptyState
                icon={<ReceiptText className="h-5 w-5" />}
                title="Tidak ada transaksi pada periode ini"
                description="Pilih rentang tanggal atau dompet lain untuk melihat rincian mutasi kas."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="print:table-header-group">
                    <tr className="border-b border-[#E7E2D8] text-xs font-medium text-[#78716C]">
                      <th className="py-2.5 pr-3">Tanggal</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                      <th className="py-2.5 px-3">Kategori / Jenis</th>
                      <th className="py-2.5 px-3">Dompet</th>
                      <th className="py-2.5 pl-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E2D8]">
                    {report.transactions.map((tx) => {
                      const isIncome = tx.type === "income";
                      const isTransfer = tx.type === "transfer";
                      const amountStr = isIncome
                        ? formatIDR(tx.amount, { signed: true })
                        : isTransfer
                          ? formatIDR(tx.amount)
                          : formatIDR(-tx.amount, { signed: true });
                      const amountClass = isIncome
                        ? "text-[#15803D]"
                        : isTransfer
                          ? "text-[#44403C]"
                          : "text-[#B91C1C]";

                      const walletDesc = isTransfer
                        ? `${tx.walletName} → ${tx.targetWalletName ?? tx.counterpartyWalletName ?? "-"}`
                        : tx.walletName;

                      return (
                        <tr key={tx.id}>
                          <td className="tnum whitespace-nowrap py-2.5 pr-3 text-[#57534E]">
                            {formatDateID(tx.occurredAt)}
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-[#1C1917]">
                              {tx.title}
                            </p>
                            {tx.notes && (
                              <p className="text-xs text-[#78716C] line-clamp-1">
                                {tx.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[#57534E]">
                            {isTransfer ? (
                              <span className="inline-flex items-center gap-1 text-[#44403C]">
                                <ArrowLeftRight className="h-3 w-3" />
                                Transfer
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                {isIncome ? (
                                  <ArrowDownLeft className="h-3 w-3 text-[#15803D]" />
                                ) : (
                                  <ArrowUpRight className="h-3 w-3 text-[#B91C1C]" />
                                )}
                                <span>
                                  {tx.categoryName ?? "Tanpa Kategori"}
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[#57534E]">
                            {walletDesc}
                          </td>
                          <td
                            className={cn(
                              "tnum whitespace-nowrap py-2.5 pl-3 text-right font-semibold",
                              amountClass
                            )}
                          >
                            {amountStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
