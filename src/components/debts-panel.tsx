"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  HandCoins,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import type { DebtsSummary, DebtType, DebtView } from "@/lib/debts";
import { formatDateID, formatIDR, getTodayISO } from "@/lib/format";
import type { WalletWithRole } from "@/lib/wallets";

function formatDigitsIDR(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function recomputeSummary(items: DebtView[]): DebtsSummary {
  let totalPayableRemaining = 0;
  let totalReceivableRemaining = 0;
  let openCount = 0;
  let settledCount = 0;

  for (const item of items) {
    if (item.status === "settled") {
      settledCount += 1;
    } else {
      openCount += 1;
      if (item.type === "payable") {
        totalPayableRemaining += item.remainingAmount;
      } else {
        totalReceivableRemaining += item.remainingAmount;
      }
    }
  }
  return {
    totalPayableRemaining,
    totalReceivableRemaining,
    openCount,
    settledCount,
  };
}

/**
 * Interactive Hutang (Payable) & Piutang (Receivable) tracker with partial/full
 * payment recording and optional wallet balance synchronization.
 */
export function DebtsPanel({
  initialDebts,
  wallets,
  createOpenExternal,
  onCreateOpenChange,
  onWalletMutated,
}: {
  initialDebts: DebtView[];
  wallets: WalletWithRole[];
  createOpenExternal: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onWalletMutated: () => void;
}) {
  const [items, setItems] = useState<DebtView[]>(initialDebts);
  const [filter, setFilter] = useState<"all" | "payable" | "receivable">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create modal state
  const [debtType, setDebtType] = useState<DebtType>("payable");
  const [personName, setPersonName] = useState("");
  const [title, setTitle] = useState("");
  const [totalDigits, setTotalDigits] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Payment modal state
  const [payTarget, setPayTarget] = useState<DebtView | null>(null);
  const [payDigits, setPayDigits] = useState("");
  const [payWalletId, setPayWalletId] = useState("");
  const [payDate, setPayDate] = useState(() => getTodayISO());
  const [paying, setPaying] = useState(false);

  const writableWallets = useMemo(
    () => wallets.filter((w) => w.role === "owner" || w.role === "editor"),
    [wallets]
  );

  const summary = useMemo(() => recomputeSummary(items), [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((d) => d.type === filter);
  }, [items, filter]);

  function openPayModal(debt: DebtView) {
    setPayTarget(debt);
    setPayDigits(String(debt.remainingAmount));
    setPayWalletId(writableWallets[0]?.id ?? "");
    setPayDate(getTodayISO());
  }

  async function handleCreateDebt(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    const amount = Number(totalDigits || "0");
    if (!personName.trim()) {
      setCreateError("Nama orang/instansi wajib diisi.");
      return;
    }
    if (title.trim().length < 2) {
      setCreateError("Keterangan minimal 2 karakter.");
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setCreateError("Total nominal harus lebih dari Rp 0.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: debtType,
          personName: personName.trim(),
          title: title.trim(),
          totalAmount: amount,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal menyimpan catatan hutang/piutang.";
        setCreateError(msg);
        toast.error(msg);
        return;
      }

      const created = data.debt as DebtView;
      setItems((prev) => [created, ...prev]);
      toast.success(
        debtType === "payable"
          ? "Catatan hutang berhasil ditambahkan."
          : "Catatan piutang berhasil ditambahkan."
      );
      setPersonName("");
      setTitle("");
      setTotalDigits("");
      setDueDate("");
      setNotes("");
      onCreateOpenChange(false);
    } catch {
      setCreateError("Terjadi gangguan jaringan.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;

    const paymentAmount = Number(payDigits || "0");
    if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0) {
      toast.error("Nominal pembayaran harus lebih dari Rp 0.");
      return;
    }
    if (paymentAmount > payTarget.remainingAmount) {
      toast.error(
        `Nominal melebihi sisa (${formatIDR(payTarget.remainingAmount)}).`
      );
      return;
    }

    setPaying(true);
    try {
      const res = await fetch(`/api/debts/${encodeURIComponent(payTarget.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentAmount,
          walletId: payWalletId || null,
          occurredAt: payDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mencatat pembayaran.");
        return;
      }

      const updated = data.debt as DebtView;
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      toast.success(
        updated.status === "settled"
          ? "Catatan hutang/piutang telah LUNAS!"
          : "Pembayaran cicilan berhasil dicatat."
      );
      if (payWalletId) {
        onWalletMutated();
      }
      setPayTarget(null);
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setPaying(false);
    }
  }

  async function handleDelete(debtId: string) {
    setBusyId(debtId);
    try {
      const res = await fetch(`/api/debts/${encodeURIComponent(debtId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Gagal menghapus catatan.");
        return;
      }
      setItems((prev) => prev.filter((d) => d.id !== debtId));
      toast.success("Catatan hutang/piutang dihapus.");
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card padding="md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#78716C]">
              Total Hutang Belum Lunas (Kewajiban Anda)
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#B91C1C]">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="tnum font-display mt-2 text-2xl sm:text-3xl font-medium text-[#B91C1C]">
            {formatIDR(summary.totalPayableRemaining)}
          </p>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#78716C]">
              Total Piutang Belum Kembali (Hak Anda)
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DCFCE7] text-[#15803D]">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <p className="tnum font-display mt-2 text-2xl sm:text-3xl font-medium text-[#15803D]">
            {formatIDR(summary.totalReceivableRemaining)}
          </p>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 p-1">
          {(
            [
              { id: "all", label: `Semua (${items.length})` },
              { id: "payable", label: "Hutang Saya" },
              { id: "receivable", label: "Piutang Orang" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                filter === f.id
                  ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                  : "text-[#57534E] hover:text-[#1C1917]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#78716C]">
          {summary.openCount} berjalan · {summary.settledCount} lunas
        </p>
      </div>

      {/* List */}
      {filteredItems.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<HandCoins className="h-5 w-5" />}
            title="Belum ada catatan hutang atau piutang"
            description="Catat cicilan, pinjaman teman, atau piutang proyek di sini agar jatuh tempo dan sisa pembayarannya selalu terpantau rapi."
            action={
              <Button
                variant="primary"
                onClick={() => onCreateOpenChange(true)}
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Hutang / Piutang</span>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredItems.map((debt) => {
            const isPayable = debt.type === "payable";
            const isSettled = debt.status === "settled";
            return (
              <Card key={debt.id} padding="md" className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isPayable ? "outflow" : "inflow"}>
                        {isPayable ? "Hutang" : "Piutang"}
                      </Badge>
                      <Badge variant={isSettled ? "forest" : "warning"}>
                        {isSettled ? "Lunas" : "Berjalan"}
                      </Badge>
                    </div>
                    <h3 className="mt-1.5 truncate text-base font-semibold text-[#1C1917]">
                      {debt.personName} · {debt.title}
                    </h3>
                    {debt.dueDate && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#78716C]">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>Jatuh tempo {formatDateID(debt.dueDate)}</span>
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={busyId === debt.id}
                    onClick={() => void handleDelete(debt.id)}
                    aria-label={`Hapus ${debt.title}`}
                    className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#B91C1C] cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-[#78716C]">
                      Terbayar{" "}
                      <strong className="tnum text-[#1C1917]">
                        {formatIDR(debt.paidAmount)}
                      </strong>{" "}
                      / {formatIDR(debt.totalAmount)}
                    </span>
                    <span
                      className={cn(
                        "tnum text-sm font-bold",
                        isSettled
                          ? "text-[#15803D]"
                          : isPayable
                            ? "text-[#B91C1C]"
                            : "text-[#14532D]"
                      )}
                    >
                      {isSettled
                        ? "Rp 0"
                        : `Sisa ${formatIDR(debt.remainingAmount)}`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        isSettled
                          ? "bg-[#15803D]"
                          : isPayable
                            ? "bg-[#B91C1C]"
                            : "bg-[#14532D]"
                      )}
                      style={{ width: `${debt.progressPct}%` }}
                    />
                  </div>
                </div>

                {debt.notes && (
                  <p className="text-xs text-[#57534E] leading-relaxed">
                    {debt.notes}
                  </p>
                )}

                {!isSettled && (
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openPayModal(debt)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        {isPayable
                          ? "Catat Bayar / Cicilan"
                          : "Catat Terima Pelunasan"}
                      </span>
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Tambah Hutang / Piutang */}
      <Modal
        open={createOpenExternal}
        onClose={() => !creating && onCreateOpenChange(false)}
        title="Catat Hutang / Piutang Baru"
        description="Pantau cicilan atau pinjaman antar teman lengkap dengan progres pelunasan."
        size="md"
      >
        <form onSubmit={handleCreateDebt} noValidate className="space-y-4">
          {createError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs text-[#B91C1C]"
            >
              {createError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 p-1">
            {(
              [
                { value: "payable", label: "Hutang (Saya Pinjam)" },
                { value: "receivable", label: "Piutang (Orang Pinjam)" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDebtType(opt.value)}
                className={cn(
                  "rounded-lg py-2 text-xs font-medium transition-colors cursor-pointer",
                  debtType === opt.value
                    ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                    : "text-[#57534E]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={debtType === "payable" ? "Pemberi Pinjaman" : "Peminjam"}
              required
              maxLength={80}
              placeholder="Contoh: Budi / Bank BCA / KPR"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
            />
            <Input
              label="Keterangan"
              required
              maxLength={120}
              placeholder="Contoh: Talangan tiket / Cicilan motor"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="debt-total-amount"
                className="block text-xs font-medium text-[#57534E]"
              >
                Total Nominal <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-xs text-[#78716C]">
                  Rp
                </span>
                <input
                  id="debt-total-amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="500.000"
                  value={formatDigitsIDR(totalDigits)}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
                    if (d.length <= 15) setTotalDigits(d);
                  }}
                  className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                />
              </div>
            </div>

            <Input
              label="Jatuh Tempo (Opsional)"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="tnum"
            />
          </div>

          <Textarea
            label="Catatan (Opsional)"
            rows={2}
            maxLength={500}
            placeholder="Nomor rekening, jadwal cicilan per bulan, dll."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 border-t border-[#E7E2D8] pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onCreateOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={creating}>
              Simpan Catatan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Catat Pembayaran / Cicilan */}
      <Modal
        open={Boolean(payTarget)}
        onClose={() => !paying && setPayTarget(null)}
        title={
          payTarget?.type === "payable"
            ? "Catat Pembayaran Hutang"
            : "Catat Penerimaan Piutang"
        }
        description={
          payTarget
            ? `${payTarget.personName} · ${payTarget.title} (Sisa ${formatIDR(payTarget.remainingAmount)})`
            : undefined
        }
        size="sm"
      >
        <form onSubmit={handleRecordPayment} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="debt-pay-amount"
              className="block text-xs font-medium text-[#57534E]"
            >
              Nominal Dibayar Sekarang <span className="text-[#B91C1C]">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-3 text-xs text-[#78716C]">
                Rp
              </span>
              <input
                id="debt-pay-amount"
                type="text"
                inputMode="numeric"
                value={formatDigitsIDR(payDigits)}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
                  if (d.length <= 15) setPayDigits(d);
                }}
                className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
              />
            </div>
          </div>

          <Select
            label="Sinkronkan ke Dompet (Opsional)"
            value={payWalletId}
            onChange={(e) => setPayWalletId(e.target.value)}
            hint="Jika dipilih, saldo dompet ikut diperbarui otomatis di buku transaksi."
          >
            <option value="">Hanya catat di Hutang/Piutang (tanpa ubah saldo)</option>
            {writableWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({formatIDR(w.balance)})
              </option>
            ))}
          </Select>

          <Input
            label="Tanggal Pembayaran"
            type="date"
            required
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className="tnum"
          />

          <div className="flex justify-end gap-2 border-t border-[#E7E2D8] pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPayTarget(null)}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={paying}>
              Konfirmasi Pembayaran
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
