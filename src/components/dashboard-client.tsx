"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  Check,
  Eye,
  Landmark,
  Mail,
  PiggyBank,
  Plus,
  SkipForward,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet as WalletIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import { ReceiptDrawer } from "@/components/receipt-drawer";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  SkeletonCard,
  cn,
} from "@/components/ui/primitives";
import { formatDateID, formatIDR, formatMonthID } from "@/lib/format";
import type { DashboardSummary, ReportScope } from "@/lib/reports";
import type { TransactionView } from "@/lib/transactions";
import type { WalletType } from "@/lib/wallets";

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

function formatShortMonthAxis(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) {
    return ym;
  }
  const idx = Number(match[2]) - 1;
  const label = SHORT_MONTHS_ID[idx] ?? ym;
  return `${label} '${match[1].slice(2)}`;
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

function formatDigitsIDR(digits: string): string {
  if (!digits) {
    return "";
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getWalletTypeMeta(type: WalletType) {
  switch (type) {
    case "bank":
      return { label: "Bank", icon: Landmark };
    case "ewallet":
      return { label: "E-Wallet", icon: Smartphone };
    case "savings":
      return { label: "Tabungan", icon: PiggyBank };
    case "cash":
    default:
      return { label: "Tunai", icon: Banknote };
  }
}

interface CashflowTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: DashboardSummary["monthlySeries"][number];
  }>;
}

function CashflowTooltip({ active, payload }: CashflowTooltipProps) {
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

/**
 * Interactive Dashboard Ringkasan view consuming `/api/dashboard?scope=all|personal`.
 */
export function DashboardClient({
  initialData,
  userName,
}: {
  initialData?: DashboardSummary;
  userName: string;
}) {
  const { openQuickAdd, refreshTrigger, triggerRefresh } = useQuickAdd();

  const [scope, setScope] = useState<ReportScope>("all");
  const [data, setData] = useState<DashboardSummary | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [chartMounted, setChartMounted] = useState(false);

  const [overrideDigits, setOverrideDigits] = useState<Record<string, string>>(
    {}
  );
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const [selectedTx, setSelectedTx] = useState<TransactionView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setChartMounted(true);
  }, []);

  const fetchDashboard = useCallback(
    async (targetScope: ReportScope, background: boolean) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setFetchError(null);

      try {
        const res = await fetch(
          `/api/dashboard?scope=${encodeURIComponent(targetScope)}`,
          { cache: "no-store" }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? "Gagal memuat ringkasan dasbor.");
        }
        setData(body as DashboardSummary);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat memuat dasbor.";
        setFetchError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchDashboard(scope, data !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, refreshTrigger, fetchDashboard]);

  async function handleAcceptInvite(token: string, inviteId: string) {
    setBusyInviteId(inviteId);
    try {
      const res = await fetch(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Gagal menerima undangan dompet.");
        return;
      }
      toast.success(
        `Berhasil bergabung ke dompet "${body.walletName ?? "Dompet Bersama"}".`
      );
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat menerima undangan.");
    } finally {
      setBusyInviteId(null);
    }
  }

  async function handleApplyRecurring(ruleId: string) {
    const rawDigits = overrideDigits[ruleId] ?? "";
    let overrideAmount: number | undefined;

    if (rawDigits) {
      const parsed = Number(rawDigits);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        toast.error("Nominal harus berupa bilangan bulat lebih dari Rp 0.");
        return;
      }
      overrideAmount = parsed;
    }

    setBusyRuleId(ruleId);
    try {
      const res = await fetch(
        `/api/recurring/${encodeURIComponent(ruleId)}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            overrideAmount !== undefined ? { amount: overrideAmount } : {}
          ),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Gagal mencatat transaksi rutin.");
        return;
      }
      toast.success("Transaksi rutin berhasil dicatat.");
      setOverrideDigits((prev) => {
        const next = { ...prev };
        delete next[ruleId];
        return next;
      });
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat mencatat transaksi rutin.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function handleSkipRecurring(ruleId: string) {
    setBusyRuleId(ruleId);
    try {
      const res = await fetch(
        `/api/recurring/${encodeURIComponent(ruleId)}/skip`,
        {
          method: "POST",
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Gagal melewati jadwal rutin.");
        return;
      }
      toast.success("Siklus jadwal rutin dilewati ke periode berikutnya.");
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat melewati jadwal rutin.");
    } finally {
      setBusyRuleId(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={3} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <SkeletonCard lines={5} />
      </div>
    );
  }

  if (!data) {
    return (
      <Card padding="lg">
        <EmptyState
          title="Ringkasan belum dapat dimuat"
          description={fetchError ?? "Silakan coba muat ulang halaman."}
          action={
            <Button
              variant="primary"
              onClick={() => void fetchDashboard(scope, false)}
            >
              Muat Ulang
            </Button>
          }
        />
      </Card>
    );
  }

  const topBudgets = data.topBudgets.slice(0, 4);
  const recentTransactions = data.recentTransactions.slice(0, 6);
  const hasGrowth = data.balanceGrowthPct !== null;
  const growthPositive = (data.balanceGrowthPct ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Page Title Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#78716C]">
            Halo, {userName}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Ringkasan Arus Kas
          </h1>
        </div>
        <p className="tnum text-xs sm:text-sm text-[#78716C]">
          Periode {formatMonthID(data.month)}
          {refreshing ? " · Menyegarkan..." : ""}
        </p>
      </div>

      {/* Pending Family Wallet Invites Banner */}
      {data.pendingInvites.length > 0 && (
        <div className="rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7]/50 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#14532D] text-[#FFFFFF]">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#14532D]">
                  Anda memiliki{" "}
                  <span className="tnum">{data.pendingInvites.length}</span>{" "}
                  undangan Dompet Bersama
                </p>
                <p className="text-xs text-[#166534]">
                  Terima undangan untuk mulai mencatat atau memantau dompet
                  keluarga.
                </p>
              </div>
            </div>
            <Link
              href="/dompet"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#14532D] hover:underline"
            >
              <span>Kelola di Dompet</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {data.pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BBF7D0] bg-[#FFFFFF] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#1C1917]">
                      {invite.walletName}
                    </p>
                    <Badge
                      variant={
                        invite.role === "editor" ? "forest" : "neutral"
                      }
                    >
                      {invite.role === "editor" ? "Editor" : "Pemantau"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    Dari {invite.inviterName} · Berlaku s.d.{" "}
                    <span className="tnum">
                      {formatDateID(invite.expiresAt)}
                    </span>
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="primary"
                  loading={busyInviteId === invite.id}
                  onClick={() => void handleAcceptInvite(invite.token, invite.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Terima</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Due Recurring Rules Banner */}
      {data.dueRecurring.length > 0 && (
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7]/45 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D97706] text-[#FFFFFF]">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#92400E]">
                  Tagihan/transaksi rutin jatuh tempo (
                  <span className="tnum">{data.dueRecurring.length}</span>)
                </p>
                <p className="text-xs text-[#B45309]">
                  Konfirmasi nominal dan catat ke buku transaksi atau lewati
                  siklus ini.
                </p>
              </div>
            </div>
            <Link
              href="/transaksi?tab=recurring"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#92400E] hover:underline"
            >
              <span>Kelola Jadwal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {data.dueRecurring.map((rule) => {
              const isBusy = busyRuleId === rule.id;
              return (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFFFF] p-3.5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#1C1917]">
                        {rule.title}
                      </span>
                      <Badge
                        variant={rule.type === "income" ? "inflow" : "outflow"}
                      >
                        {rule.type === "income" ? "Masuk" : "Keluar"}
                      </Badge>
                      <Badge variant="warning">
                        {rule.frequency === "weekly" ? "Mingguan" : "Bulanan"}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#57534E]">
                      {rule.walletName} · {rule.categoryName} · Jatuh tempo{" "}
                      <span className="tnum font-medium text-[#1C1917]">
                        {formatDateID(rule.nextRunDate)}
                      </span>{" "}
                      · Bawaan{" "}
                      <span className="tnum font-semibold text-[#1C1917]">
                        {formatIDR(rule.amount)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-44">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#78716C]">
                        Rp
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Ubah nominal untuk ${rule.title}`}
                        placeholder={formatDigitsIDR(String(rule.amount))}
                        value={formatDigitsIDR(overrideDigits[rule.id] ?? "")}
                        disabled={isBusy}
                        onChange={(e) => {
                          const digits = e.target.value
                            .replace(/\D/g, "")
                            .replace(/^0+/, "");
                          if (digits.length > 15) {
                            return;
                          }
                          setOverrideDigits((prev) => ({
                            ...prev,
                            [rule.id]: digits,
                          }));
                        }}
                        className="tnum h-8 w-full rounded-lg border border-[#E7E2D8] bg-[#F7F5F0]/50 pl-8 pr-2.5 text-xs text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:bg-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={isBusy}
                      onClick={() => void handleApplyRecurring(rule.id)}
                    >
                      Catat Sekarang
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => void handleSkipRecurring(rule.id)}
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      <span>Lewati</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hero Balance Sheet */}
      <Card padding="lg" className="relative overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
                Total Saldo{" "}
                {scope === "personal" ? "Dompet Pribadi" : "Dompet Aktif"}
              </span>

              {hasGrowth ? (
                <Badge variant={growthPositive ? "inflow" : "outflow"}>
                  {growthPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span className="tnum">
                    {growthPositive ? "+" : ""}
                    {data.balanceGrowthPct}% bulan ini
                  </span>
                </Badge>
              ) : (
                <Badge variant="neutral">
                  <span className="tnum">
                    Bulan lalu: {formatIDR(data.previousMonthNet, { signed: true })}
                  </span>
                </Badge>
              )}
            </div>

            <p className="tnum font-display text-4xl sm:text-5xl font-medium tracking-tight text-[#1C1917]">
              {formatIDR(data.totalBalance)}
            </p>

            <p className="text-xs sm:text-sm text-[#57534E]">
              Mencakup{" "}
              <span className="tnum font-semibold text-[#1C1917]">
                {data.activeWallets.length}
              </span>{" "}
              dompet dengan akses catat.
              {data.watchedWallets.length > 0 && (
                <>
                  {" "}
                  (<span className="tnum">{data.watchedWallets.length}</span>{" "}
                  dompet pantauan terpisah)
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            {/* Scope Segmented Toggle */}
            <div
              role="group"
              aria-label="Cakupan saldo dasbor"
              className="inline-flex rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 p-1"
            >
              <button
                type="button"
                onClick={() => setScope("all")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  scope === "all"
                    ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                    : "text-[#57534E] hover:text-[#1C1917]"
                )}
              >
                Semua Dompet Aktif
              </button>
              <button
                type="button"
                onClick={() => setScope("personal")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  scope === "personal"
                    ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                    : "text-[#57534E] hover:text-[#1C1917]"
                )}
              >
                Dompet Pribadi
              </button>
            </div>

            <Button
              variant="primary"
              size="md"
              pill
              onClick={() => openQuickAdd("expense")}
            >
              <Plus className="h-4 w-4" />
              <span>Catat Kas</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#78716C]">
              Uang Masuk Bulan Ini
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DCFCE7] text-[#15803D]">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <p className="tnum font-display mt-2.5 text-2xl sm:text-3xl font-medium text-[#15803D]">
            {formatIDR(data.currentMonthIncome)}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            Pemasukan {formatMonthID(data.month)} (tanpa transfer internal)
          </p>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#78716C]">
              Uang Keluar Bulan Ini
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#B91C1C]">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="tnum font-display mt-2.5 text-2xl sm:text-3xl font-medium text-[#B91C1C]">
            {formatIDR(data.currentMonthExpense)}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            Pengeluaran {formatMonthID(data.month)} (tanpa transfer internal)
          </p>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#78716C]">
              Selisih Bersih & Rasio Menabung
            </span>
            <Badge
              variant={
                data.savingRate >= 20
                  ? "inflow"
                  : data.savingRate >= 0
                    ? "warning"
                    : "outflow"
              }
            >
              <span className="tnum">{data.savingRate}%</span>
            </Badge>
          </div>
          <p
            className={cn(
              "tnum font-display mt-2.5 text-2xl sm:text-3xl font-medium",
              data.currentMonthNet >= 0 ? "text-[#15803D]" : "text-[#B91C1C]"
            )}
          >
            {formatIDR(data.currentMonthNet, { signed: true })}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            Rasio menabung:{" "}
            <span className="tnum font-semibold text-[#1C1917]">
              {data.savingRate}%
            </span>{" "}
            · Bulan lalu:{" "}
            <span className="tnum">
              {formatIDR(data.previousMonthNet, { signed: true })}
            </span>
          </p>
        </Card>
      </div>

      {/* 6-Month Cashflow Chart */}
      <Card padding="md">
        <CardHeader
          serif
          title="Arus Kas 6 Bulan Terakhir"
          subtitle="Perbandingan Uang Masuk dan Uang Keluar bulanan (tidak termasuk transfer antar dompet)"
          action={
            <div className="hidden sm:flex items-center gap-4 text-xs text-[#57534E]">
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

        <div className="h-[270px] w-full">
          {chartMounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.monthlySeries}
                margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                barGap={6}
              >
                <CartesianGrid
                  stroke="#E7E2D8"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatShortMonthAxis}
                  tick={{ fontSize: 12, fill: "#78716C" }}
                  axisLine={{ stroke: "#E7E2D8" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCompactAxisIDR}
                  tick={{ fontSize: 11, fill: "#78716C" }}
                  axisLine={false}
                  tickLine={false}
                  width={76}
                />
                <Tooltip
                  cursor={{ fill: "#EFECE4", opacity: 0.45 }}
                  content={<CashflowTooltip />}
                />
                <Bar
                  dataKey="income"
                  name="Uang Masuk"
                  fill="#15803D"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="expense"
                  name="Uang Keluar"
                  fill="#B91C1C"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full rounded-xl bg-[#F7F5F0] animate-pulse" />
          )}
        </div>
      </Card>

      {/* Two-Column Detail Row: Budgets & Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Top 4 Budgets */}
        <Card padding="md" className="lg:col-span-5 flex flex-col">
          <CardHeader
            serif
            title="Anggaran Bulan Ini"
            subtitle={`Pantauan batas belanja ${formatMonthID(data.month)}`}
            action={
              <Link
                href="/anggaran"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap"
              >
                <span>Lihat Semua →</span>
              </Link>
            }
          />

          {topBudgets.length === 0 ? (
            <EmptyState
              title="Belum ada anggaran"
              description="Tetapkan batas anggaran per kategori untuk menjaga pengeluaran tetap terkendali."
              action={
                <Link
                  href="/anggaran"
                  className="inline-flex h-9 items-center rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 text-xs font-medium text-[#1C1917] hover:bg-[#EFECE4]"
                >
                  Atur Anggaran
                </Link>
              }
              className="py-8"
            />
          ) : (
            <div className="space-y-4">
              {topBudgets.map((budget) => {
                const barWidth = Math.min(100, Math.max(0, budget.percentage));
                const barColor =
                  budget.status === "exceeded"
                    ? "bg-[#B91C1C]"
                    : budget.status === "warning"
                      ? "bg-[#D97706]"
                      : "bg-[#15803D]";
                const badgeVariant =
                  budget.status === "exceeded"
                    ? "outflow"
                    : budget.status === "warning"
                      ? "warning"
                      : "inflow";
                const statusLabel =
                  budget.status === "exceeded"
                    ? "Melebihi"
                    : budget.status === "warning"
                      ? "Waspada"
                      : "Aman";

                return (
                  <div
                    key={budget.id}
                    className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/50 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: budget.categoryColor }}
                        />
                        <span className="truncate text-sm font-medium text-[#1C1917]">
                          {budget.categoryName}
                        </span>
                      </div>
                      <Badge variant={badgeVariant}>
                        <span className="tnum">
                          {statusLabel} · {budget.percentage}%
                        </span>
                      </Badge>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          barColor
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#78716C]">
                      <span className="tnum">
                        Terpakai{" "}
                        <strong className="font-semibold text-[#1C1917]">
                          {formatIDR(budget.spentAmount)}
                        </strong>
                      </span>
                      <span className="tnum">
                        Batas {formatIDR(budget.limitAmount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 6 Latest Transactions */}
        <Card padding="md" className="lg:col-span-7 flex flex-col">
          <CardHeader
            serif
            title="Aktivitas Terbaru"
            subtitle="Klik baris transaksi untuk membuka struk dan lampiran"
            action={
              <Link
                href="/transaksi"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap"
              >
                <span>Semua Transaksi →</span>
              </Link>
            }
          />

          {recentTransactions.length === 0 ? (
            <EmptyState
              title="Belum ada transaksi"
              description="Catat pemasukan, pengeluaran, atau transfer pertama Anda dari tombol Catat Kas."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => openQuickAdd("expense")}
                >
                  <Plus className="h-4 w-4" />
                  <span>Catat Kas</span>
                </Button>
              }
              className="py-8"
            />
          ) : (
            <div className="divide-y divide-[#E7E2D8]">
              {recentTransactions.map((tx) => {
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

                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => {
                      setSelectedTx(tx);
                      setDrawerOpen(true);
                    }}
                    className="flex w-full items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-xl text-left transition-colors hover:bg-[#F7F5F0] cursor-pointer"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E7E2D8]",
                          isIncome
                            ? "bg-[#DCFCE7]/60 text-[#15803D]"
                            : isTransfer
                              ? "bg-[#EFECE4] text-[#44403C]"
                              : "bg-[#FEE2E2]/50 text-[#B91C1C]"
                        )}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : isTransfer ? (
                          <ArrowLeftRight className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#1C1917]">
                          {tx.title}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#78716C]">
                          {isTransfer ? (
                            <span className="inline-flex items-center rounded-md bg-[#EFECE4] px-1.5 py-0.5 text-[11px] font-medium text-[#44403C]">
                              Transfer
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#F7F5F0] border border-[#E7E2D8] px-1.5 py-0.5 text-[11px] font-medium text-[#57534E]">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    tx.categoryColor ?? "#78716C",
                                }}
                              />
                              {tx.categoryName ?? "Tanpa Kategori"}
                            </span>
                          )}
                          <span>·</span>
                          <span className="truncate max-w-[140px]">
                            {isTransfer && tx.targetWalletName
                              ? `${tx.walletName} → ${tx.targetWalletName}`
                              : tx.walletName}
                          </span>
                          <span>·</span>
                          <span className="tnum">
                            {formatDateID(tx.occurredAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "tnum shrink-0 text-sm font-semibold",
                        amountClass
                      )}
                    >
                      {amountStr}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Dompet Aktif Strip */}
      <Card padding="md">
        <CardHeader
          serif
          title="Dompet Aktif"
          subtitle="Dompet pribadi dan bersama dengan izin pencatatan"
          action={
            <Link
              href="/dompet"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#14532D] hover:underline"
            >
              <span>Kelola Dompet →</span>
            </Link>
          }
        />

        {data.activeWallets.length === 0 ? (
          <EmptyState
            icon={<WalletIcon className="h-5 w-5" />}
            title="Belum ada dompet aktif"
            description="Buat dompet baru atau ubah filter cakupan ke Semua Dompet Aktif."
            action={
              <Link
                href="/dompet"
                className="inline-flex h-9 items-center rounded-xl bg-[#14532D] px-4 text-xs font-medium text-[#FFFFFF] hover:bg-[#166534]"
              >
                Buka Halaman Dompet
              </Link>
            }
            className="py-8"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.activeWallets.map((wallet) => {
              const typeMeta = getWalletTypeMeta(wallet.type);
              const WalletTypeIcon = typeMeta.icon;

              return (
                <div
                  key={wallet.id}
                  className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/55 p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] text-[#14532D]">
                        <WalletTypeIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1C1917]">
                          {wallet.name}
                        </p>
                        <p className="text-xs text-[#78716C]">
                          {typeMeta.label}
                          {wallet.role === "editor"
                            ? ` · Milik ${wallet.ownerName}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    {wallet.isShared && (
                      <Badge variant="forest">
                        <Users className="h-3 w-3" />
                        <span>Bersama</span>
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <p className="tnum font-display text-xl font-medium text-[#1C1917]">
                      {formatIDR(wallet.balance)}
                    </p>
                    <button
                      type="button"
                      onClick={() => openQuickAdd("expense", wallet.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] px-2.5 py-1 text-xs font-medium text-[#14532D] transition-colors hover:bg-[#EFECE4] cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Catat</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Dompet Dipantau (Viewer) Strip */}
      {data.watchedWallets.length > 0 && (
        <Card padding="md" subtle>
          <CardHeader
            serif
            title="Dompet Dipantau"
            subtitle="Akses Pemantau · saldo tidak dihitung ke total saldo atau arus kas pribadi"
            action={
              <Badge variant="neutral">
                <Eye className="h-3 w-3" />
                <span>Hanya Pantau · Tidak masuk saldo pribadi</span>
              </Badge>
            }
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.watchedWallets.map((wallet) => {
              const typeMeta = getWalletTypeMeta(wallet.type);
              const WalletTypeIcon = typeMeta.icon;

              return (
                <div
                  key={wallet.id}
                  className="rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/60 text-[#57534E]">
                        <WalletTypeIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1C1917]">
                          {wallet.name}
                        </p>
                        <p className="text-xs text-[#78716C]">
                          {typeMeta.label} · Pemilik: {wallet.ownerName}
                        </p>
                      </div>
                    </div>

                    <Badge variant="neutral">Pemantau</Badge>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <p className="tnum font-display text-xl font-medium text-[#57534E]">
                      {formatIDR(wallet.balance)}
                    </p>
                    <Link
                      href="/transaksi"
                      className="text-xs font-medium text-[#14532D] hover:underline"
                    >
                      Lihat Riwayat →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ReceiptDrawer
        transaction={selectedTx}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={(updated) => {
          setSelectedTx(updated);
          triggerRefresh();
        }}
        onDeleted={() => {
          setSelectedTx(null);
          triggerRefresh();
        }}
      />
    </div>
  );
}
