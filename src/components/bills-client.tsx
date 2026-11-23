"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Receipt,
  SkipForward,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Select,
  cn,
} from "@/components/ui/primitives";
import type { CategoryRecord } from "@/lib/categories";
import { formatDateID, formatIDR, formatMonthID, getTodayISO } from "@/lib/format";
import type { RecurringFrequency, RecurringRuleView } from "@/lib/recurring";
import { formatDigitsIDR, sanitizePositiveDigits } from "@/lib/view-helpers";
import type { WalletWithRole } from "@/lib/wallets";

type BillFilterTab = "all" | "unpaid" | "paid" | "paused";

const BILL_PRESETS = [
  { label: "Listrik PLN", title: "Tagihan Listrik PLN", amount: "350000" },
  { label: "Internet / WiFi", title: "Tagihan Internet WiFi", amount: "320000" },
  { label: "Air PDAM", title: "Tagihan Air PDAM", amount: "120000" },
  { label: "Sewa / KPR", title: "Cicilan / Sewa Rumah", amount: "2500000" },
  { label: "BPJS / Asuransi", title: "Iuran BPJS & Asuransi", amount: "150000" },
  { label: "Pulsa / Data", title: "Paket Data Bulanan", amount: "100000" },
] as const;

interface BillsClientProps {
  initialMonth: string;
  initialRules: RecurringRuleView[];
  initialExpenseCategories: CategoryRecord[];
  initialWallets: WalletWithRole[];
}

export function BillsClient({
  initialMonth,
  initialRules,
  initialExpenseCategories,
  initialWallets,
}: BillsClientProps) {
  const router = useRouter();
  const { refreshTrigger, triggerRefresh } = useQuickAdd();

  const [rules, setRules] = useState<RecurringRuleView[]>(initialRules);
  const [filterTab, setFilterTab] = useState<BillFilterTab>("all");
  const [overrideDigits, setOverrideDigits] = useState<Record<string, string>>(
    {}
  );
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);

  // Create / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRuleView | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formAmountDigits, setFormAmountDigits] = useState("");
  const [formWalletId, setFormWalletId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formFrequency, setFormFrequency] =
    useState<RecurringFrequency>("monthly");
  const [formNextRunDate, setFormNextRunDate] = useState(() => getTodayISO());
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<RecurringRuleView | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const ownedWallets = useMemo(
    () => initialWallets.filter((w) => w.role === "owner"),
    [initialWallets]
  );

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/recurring", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.rules)) {
        setRules(data.rules as RecurringRuleView[]);
      }
    } catch {
      // silent refresh failure
    }
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      void loadRules();
    }
  }, [refreshTrigger, loadRules]);

  const expenseBills = useMemo(
    () => rules.filter((r) => r.type === "expense"),
    [rules]
  );

  const summary = useMemo(() => {
    const active = expenseBills.filter((r) => r.isActive);
    const unpaid = active.filter(
      (r) => r.nextRunDate.slice(0, 7) <= initialMonth
    );
    const paid = active.filter((r) => r.nextRunDate.slice(0, 7) > initialMonth);
    const dueNow = unpaid.filter((r) => r.isDue);
    const totalMonthly = active.reduce((sum, r) => sum + r.amount, 0);
    const remainingUnpaid = unpaid.reduce((sum, r) => sum + r.amount, 0);
    const paidTotal = paid.reduce((sum, r) => sum + r.amount, 0);
    return {
      activeCount: active.length,
      unpaidCount: unpaid.length,
      paidCount: paid.length,
      dueCount: dueNow.length,
      totalMonthly,
      remainingUnpaid,
      paidTotal,
    };
  }, [expenseBills, initialMonth]);

  const filteredBills = useMemo(() => {
    if (filterTab === "unpaid") {
      return expenseBills.filter(
        (r) => r.isActive && r.nextRunDate.slice(0, 7) <= initialMonth
      );
    }
    if (filterTab === "paid") {
      return expenseBills.filter(
        (r) => r.isActive && r.nextRunDate.slice(0, 7) > initialMonth
      );
    }
    if (filterTab === "paused") {
      return expenseBills.filter((r) => !r.isActive);
    }
    return expenseBills;
  }, [expenseBills, filterTab, initialMonth]);

  function openCreateModal(preset?: (typeof BILL_PRESETS)[number]) {
    setEditingRule(null);
    setFormTitle(preset?.title ?? "");
    setFormAmountDigits(preset?.amount ?? "");
    setFormWalletId(ownedWallets[0]?.id ?? "");
    const utilityCat =
      initialExpenseCategories.find((c) =>
        c.name.toLowerCase().includes("tagihan")
      ) ?? initialExpenseCategories[0];
    setFormCategoryId(utilityCat?.id ?? "");
    setFormFrequency("monthly");
    setFormNextRunDate(getTodayISO());
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(rule: RecurringRuleView) {
    setEditingRule(rule);
    setFormTitle(rule.title);
    setFormAmountDigits(String(rule.amount));
    setFormWalletId(rule.walletId);
    setFormCategoryId(rule.categoryId);
    setFormFrequency(rule.frequency);
    setFormNextRunDate(rule.nextRunDate);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmitBill(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const amount = Number(formAmountDigits);
    if (!formTitle.trim()) {
      setFormError("Nama tagihan wajib diisi.");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError("Nominal tagihan harus lebih dari Rp 0.");
      return;
    }
    if (!formWalletId) {
      setFormError("Pilih dompet pembayaran terlebih dahulu.");
      return;
    }
    if (!formCategoryId) {
      setFormError("Pilih kategori tagihan.");
      return;
    }

    setSavingForm(true);
    try {
      const endpoint = editingRule
        ? `/api/recurring/${editingRule.id}`
        : "/api/recurring";
      const res = await fetch(endpoint, {
        method: editingRule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          amount,
          walletId: formWalletId,
          categoryId: formCategoryId,
          type: "expense",
          frequency: formFrequency,
          nextRunDate: formNextRunDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error ?? "Gagal menyimpan tagihan.");
        return;
      }

      toast.success(
        editingRule
          ? "Tagihan bulanan diperbarui."
          : "Tagihan bulanan baru ditambahkan."
      );
      setModalOpen(false);
      await loadRules();
      triggerRefresh();
      router.refresh();
    } catch {
      setFormError("Terjadi gangguan jaringan.");
    } finally {
      setSavingForm(false);
    }
  }

  async function handlePayBill(rule: RecurringRuleView) {
    setBusyRuleId(rule.id);
    try {
      const rawOverride = overrideDigits[rule.id];
      const overrideAmount =
        rawOverride && Number(rawOverride) > 0
          ? Number(rawOverride)
          : undefined;

      const res = await fetch(`/api/recurring/${rule.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrideAmount ? { overrideAmount } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mencatat pembayaran tagihan.");
        return;
      }

      toast.success(
        `Tagihan "${rule.title}" (${formatIDR(overrideAmount ?? rule.amount)}) lunas & dicatat!`
      );
      setOverrideDigits((prev) => {
        const next = { ...prev };
        delete next[rule.id];
        return next;
      });
      await loadRules();
      triggerRefresh();
      router.refresh();
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function handleSkipBill(rule: RecurringRuleView) {
    setBusyRuleId(rule.id);
    try {
      const res = await fetch(`/api/recurring/${rule.id}/skip`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal melewati siklus tagihan.");
        return;
      }
      toast.success(`Siklus tagihan "${rule.title}" digeser ke periode berikut.`);
      await loadRules();
      triggerRefresh();
      router.refresh();
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function handleToggleActive(rule: RecurringRuleView) {
    setBusyRuleId(rule.id);
    try {
      const res = await fetch(`/api/recurring/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mengubah status tagihan.");
        return;
      }
      toast.success(
        rule.isActive ? "Tagihan dijeda sementara." : "Tagihan diaktifkan lagi."
      );
      await loadRules();
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/recurring/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Gagal menghapus tagihan.");
        return;
      }
      toast.success(`Tagihan "${deleteTarget.title}" dihapus.`);
      setDeleteTarget(null);
      await loadRules();
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#EADBC0] bg-[#FDF8EE] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>Jadwal Kewajiban Bulanan · {formatMonthID(initialMonth)}</span>
          </div>
          <h1 className="font-display mt-2 text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Tagihan Setiap Bulan
          </h1>
          <p className="mt-1 text-sm text-[#57534E] max-w-2xl">
            Pantau tagihan rutin (Listrik, Internet, Cicilan, Air, BPJS) agar
            tidak telat bayar dan langsung tercatat ke saldo dompet dalam 1
            klik.
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          disabled={ownedWallets.length === 0}
          onClick={() => openCreateModal()}
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Tagihan Bulanan</span>
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#78716C]">
              Total Tagihan Rutin / Bulan
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFECE4] text-[#57534E]">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <p className="tnum font-display mt-2.5 text-2xl sm:text-3xl font-medium text-[#1C1917]">
            {formatIDR(summary.totalMonthly)}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            Dari {summary.activeCount} tagihan rutin aktif
          </p>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#78716C]">
              Sisa Harus Dibayar Bulan Ini
            </span>
            <Badge variant={summary.dueCount > 0 ? "outflow" : "warning"}>
              {summary.unpaidCount} belum bayar
            </Badge>
          </div>
          <p className="tnum font-display mt-2.5 text-2xl sm:text-3xl font-medium text-[#B91C1C]">
            {formatIDR(summary.remainingUnpaid)}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            {summary.dueCount > 0
              ? `${summary.dueCount} tagihan sudah jatuh tempo sekarang`
              : "Belum ada yang lewat jatuh tempo hari ini"}
          </p>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#78716C]">
              Sudah Dibayar Bulan Ini
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DCFCE7] text-[#15803D]">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="tnum font-display mt-2.5 text-2xl sm:text-3xl font-medium text-[#15803D]">
            {formatIDR(summary.paidTotal)}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            {summary.paidCount} tagihan berstatus lunas &amp; terjadwal bulan depan
          </p>
        </Card>
      </div>

      {/* Quick Presets Row */}
      {ownedWallets.length > 0 && (
        <div className="rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-[#14532D] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Tambah Cepat Template Tagihan Umum:</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BILL_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => openCreateModal(preset)}
                className="rounded-full border border-[#CBE0D2] bg-[#FFFFFF] px-3 py-1 text-xs font-medium text-[#14532D] hover:bg-[#DCFCE7] transition-colors cursor-pointer"
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E7E2D8] pb-3">
        {(
          [
            { key: "all", label: `Semua Tagihan (${expenseBills.length})` },
            { key: "unpaid", label: `Harus Dibayar (${summary.unpaidCount})` },
            {
              key: "paid",
              label: `Sudah Lunas Bulan Ini (${summary.paidCount})`,
            },
            {
              key: "paused",
              label: `Dijeda (${expenseBills.filter((r) => !r.isActive).length})`,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilterTab(item.key)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
              filterTab === item.key
                ? "bg-[#14532D] text-[#FFFFFF]"
                : "border border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E] hover:bg-[#EFECE4] hover:text-[#1C1917]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Bills List */}
      <Card padding="md">
        <CardHeader
          serif
          title="Daftar Tagihan"
          subtitle="Saat Anda klik Catat Bayar, saldo dompet langsung terpotong & tanggal tagihan bergeser ke bulan depan."
          action={
            <Link
              href="/transaksi"
              className="text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap"
            >
              Lihat Riwayat Transaksi →
            </Link>
          }
        />

        {filteredBills.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="Belum ada daftar tagihan bulanan di tab ini"
            description="Tambahkan tagihan tetap seperti Listrik PLN, WiFi, Cicilan Rumah, atau BPJS agar tidak pernah terlewat setiap bulan."
            action={
              ownedWallets.length > 0 ? (
                <Button size="sm" onClick={() => openCreateModal()}>
                  <Plus className="h-4 w-4" />
                  <span>Tambah Tagihan Bulanan</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-[#EFECE4]">
            {filteredBills.map((rule) => {
              const isPaidThisMonth =
                rule.isActive && rule.nextRunDate.slice(0, 7) > initialMonth;
              const isBusy = busyRuleId === rule.id;

              return (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: rule.categoryColor }}
                      />
                      <span className="text-sm sm:text-base font-semibold text-[#1C1917]">
                        {rule.title}
                      </span>
                      {!rule.isActive ? (
                        <Badge variant="neutral">Dijeda</Badge>
                      ) : rule.isDue ? (
                        <Badge variant="outflow">Jatuh Tempo</Badge>
                      ) : isPaidThisMonth ? (
                        <Badge variant="inflow">Lunas Bulan Ini</Badge>
                      ) : (
                        <Badge variant="warning">Belum Dibayar</Badge>
                      )}
                      <Badge variant="neutral">
                        {rule.frequency === "monthly" ? "Bulanan" : "Mingguan"}
                      </Badge>
                    </div>

                    <p className="text-xs text-[#78716C] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{rule.walletName}</span>
                      <span>·</span>
                      <span>{rule.categoryName}</span>
                      <span>·</span>
                      <span className="tnum">
                        {isPaidThisMonth
                          ? `Tagihan berikut: ${formatDateID(rule.nextRunDate)}`
                          : `Jatuh tempo: ${formatDateID(rule.nextRunDate)}`}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tnum font-display text-lg font-medium text-[#1C1917] mr-1">
                      {formatIDR(rule.amount)}
                    </span>

                    {rule.isActive && !isPaidThisMonth && (
                      <>
                        <div className="relative w-32">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#78716C]">
                            Rp
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Nominal riil ${rule.title}`}
                            placeholder={formatDigitsIDR(String(rule.amount))}
                            value={formatDigitsIDR(
                              overrideDigits[rule.id] ?? ""
                            )}
                            onChange={(e) => {
                              const digits = sanitizePositiveDigits(
                                e.target.value
                              );
                              setOverrideDigits((prev) => ({
                                ...prev,
                                [rule.id]: digits,
                              }));
                            }}
                            className="tnum h-8 w-full rounded-lg border border-[#E7E2D8] bg-[#FAF8F4] pl-8 pr-2 text-xs text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                          />
                        </div>

                        <Button
                          size="sm"
                          variant="primary"
                          loading={isBusy}
                          onClick={() => void handlePayBill(rule)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Catat Bayar</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => void handleSkipBill(rule)}
                          title="Lewati siklus bulan ini tanpa memotong saldo"
                        >
                          <SkipForward className="h-3.5 w-3.5" />
                          <span>Lewati</span>
                        </Button>
                      </>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleActive(rule)}
                      title={
                        rule.isActive
                          ? "Jeda tagihan sementara"
                          : "Aktifkan tagihan kembali"
                      }
                      className="rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] p-1.5 text-[#57534E] hover:bg-[#EFECE4] cursor-pointer"
                    >
                      {rule.isActive ? (
                        <PauseCircle className="h-4 w-4" />
                      ) : (
                        <PlayCircle className="h-4 w-4 text-[#15803D]" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => openEditModal(rule)}
                      title="Edit tagihan"
                      className="rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] p-1.5 text-[#57534E] hover:bg-[#EFECE4] cursor-pointer"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setDeleteTarget(rule)}
                      title="Hapus tagihan"
                      className="rounded-lg border border-[#FECACA] bg-[#FFFFFF] p-1.5 text-[#B91C1C] hover:bg-[#FEE2E2] cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create / Edit Bill Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? "Edit Tagihan Bulanan" : "Tambah Tagihan Bulanan"}
        description="Tagihan akan otomatis muncul sebagai pengingat & dapat dibayar 1 klik setiap siklus."
        size="md"
      >
        <form onSubmit={handleSubmitBill} noValidate className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {formError}
            </div>
          )}

          <Input
            label="Nama Tagihan"
            required
            placeholder="Misal: Listrik PLN, WiFi Biznet, Cicilan Motor"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />

          <Input
            label="Nominal Perkiraan per Periode (Rp)"
            required
            inputMode="numeric"
            placeholder="Misal: 350.000"
            value={formatDigitsIDR(formAmountDigits)}
            onChange={(e) =>
              setFormAmountDigits(sanitizePositiveDigits(e.target.value))
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Dompet Sumber Pembayaran"
              value={formWalletId}
              onChange={(e) => setFormWalletId(e.target.value)}
            >
              {ownedWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatIDR(w.balance)})
                </option>
              ))}
            </Select>

            <Select
              label="Kategori"
              value={formCategoryId}
              onChange={(e) => setFormCategoryId(e.target.value)}
            >
              {initialExpenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Siklus Tagihan"
              value={formFrequency}
              onChange={(e) =>
                setFormFrequency(e.target.value as RecurringFrequency)
              }
            >
              <option value="monthly">Setiap Bulan (Bulanan)</option>
              <option value="weekly">Setiap Minggu (Mingguan)</option>
            </Select>

            <Input
              label="Tanggal Jatuh Tempo Berikutnya"
              type="date"
              required
              value={formNextRunDate}
              onChange={(e) => setFormNextRunDate(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" loading={savingForm}>
              {editingRule ? "Simpan Perubahan" : "Simpan Tagihan"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Tagihan Rutin?"
        description="Riwayat pembayaran masa lalu tetap aman dan tidak akan terhapus."
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#57534E]">
            Yakin ingin menghapus jadwal tagihan{" "}
            <strong className="text-[#1C1917]">{deleteTarget?.title}</strong>?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              Hapus
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
