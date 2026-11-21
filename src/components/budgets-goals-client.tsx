"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  SkeletonCard,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import type { BudgetProgressView } from "@/lib/budgets";
import type { CategoryRecord } from "@/lib/categories";
import {
  formatDateID,
  formatIDR,
  formatMonthID,
  getCurrentMonthYM,
  getPreviousMonthYM,
  getTodayISO,
} from "@/lib/format";
import type { SavingsGoalView } from "@/lib/goals";
import {
  formatDigitsIDR,
  getNextMonthYM,
  sanitizeNonNegativeDigits,
  sanitizePositiveDigits,
  summarizeBudgets,
} from "@/lib/view-helpers";
import type { WalletWithRole } from "@/lib/wallets";

interface BudgetsGoalsClientProps {
  initialMonth: string;
  initialBudgets: BudgetProgressView[];
  initialGoals: SavingsGoalView[];
  initialExpenseCategories: CategoryRecord[];
  initialWallets: WalletWithRole[];
}

function getBudgetStatusMeta(status: BudgetProgressView["status"]) {
  if (status === "exceeded") {
    return {
      label: "Melebihi",
      badgeVariant: "outflow" as const,
      barColor: "bg-[#B91C1C]",
    };
  }
  if (status === "warning") {
    return {
      label: "Waspada",
      badgeVariant: "warning" as const,
      barColor: "bg-[#D97706]",
    };
  }
  return {
    label: "Aman",
    badgeVariant: "inflow" as const,
    barColor: "bg-[#15803D]",
  };
}

/**
 * Anggaran Bulanan & Target Tabungan client view with month navigation,
 * previous-month copy, budget progress cards, goal CRUD, and dual-mode deposits.
 */
export function BudgetsGoalsClient({
  initialMonth,
  initialBudgets,
  initialGoals,
  initialExpenseCategories,
  initialWallets,
}: BudgetsGoalsClientProps) {
  const { refreshTrigger, triggerRefresh } = useQuickAdd();
  const [currentMonth, setCurrentMonth] = useState(initialMonth);

  useEffect(() => {
    setCurrentMonth(getCurrentMonthYM());
  }, []);

  // Core data state
  const [month, setMonth] = useState(initialMonth);
  const [budgets, setBudgets] = useState<BudgetProgressView[]>(initialBudgets);
  const [goals, setGoals] = useState<SavingsGoalView[]>(initialGoals);
  const [expenseCategories, setExpenseCategories] = useState<CategoryRecord[]>(
    initialExpenseCategories
  );
  const [wallets, setWallets] = useState<WalletWithRole[]>(initialWallets);

  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [refreshingBudgets, setRefreshingBudgets] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [copyingBudgets, setCopyingBudgets] = useState(false);

  // Stale-response guards
  const budgetSeqRef = useRef(0);
  const budgetAbortRef = useRef<AbortController | null>(null);
  const goalsSeqRef = useRef(0);
  const goalsAbortRef = useRef<AbortController | null>(null);
  const hasHydratedBudgetsRef = useRef(true);
  const hasHydratedGoalsRef = useRef(true);
  const hasLeftInitialBudgetsStateRef = useRef(false);

  // Budget Modal state
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] =
    useState<BudgetProgressView | null>(null);
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetLimitDigits, setBudgetLimitDigits] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null);

  // Delete Budget confirmation
  const [deleteBudgetTarget, setDeleteBudgetTarget] =
    useState<BudgetProgressView | null>(null);
  const [deletingBudget, setDeletingBudget] = useState(false);

  // Goal Create / Edit Modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalView | null>(null);
  const [goalName, setGoalName] = useState("");
  const [goalTargetDigits, setGoalTargetDigits] = useState("");
  const [goalInitialDigits, setGoalInitialDigits] = useState("0");
  const [goalWalletId, setGoalWalletId] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [goalNotes, setGoalNotes] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalFormError, setGoalFormError] = useState<string | null>(null);

  // Delete Goal confirmation
  const [deleteGoalTarget, setDeleteGoalTarget] =
    useState<SavingsGoalView | null>(null);
  const [deletingGoal, setDeletingGoal] = useState(false);

  // Dual-Mode Deposit Modal state
  const [depositGoal, setDepositGoal] = useState<SavingsGoalView | null>(null);
  const [depositMode, setDepositMode] = useState<"wallet_transfer" | "virtual">(
    "wallet_transfer"
  );
  const [depositAmountDigits, setDepositAmountDigits] = useState("");
  const [depositSourceWalletId, setDepositSourceWalletId] = useState("");
  const [depositDate, setDepositDate] = useState(() => getTodayISO());
  const [depositNotes, setDepositNotes] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositFormError, setDepositFormError] = useState<string | null>(null);

  const writableWallets = useMemo(
    () =>
      wallets.filter(
        (w) =>
          w.archivedAt === null && (w.role === "owner" || w.role === "editor")
      ),
    [wallets]
  );

  const budgetSummary = useMemo(() => summarizeBudgets(budgets), [budgets]);

  const fetchBudgets = useCallback(
    async (targetMonth: string, background = false) => {
      budgetAbortRef.current?.abort();
      const controller = new AbortController();
      budgetAbortRef.current = controller;
      const seq = ++budgetSeqRef.current;

      if (background) {
        setRefreshingBudgets(true);
      } else {
        setLoadingBudgets(true);
      }
      setBudgetError(null);

      try {
        const res = await fetch(
          `/api/budgets?month=${encodeURIComponent(targetMonth)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted || seq !== budgetSeqRef.current) {
          return;
        }
        if (!res.ok) {
          throw new Error(data.error ?? "Gagal memuat data anggaran.");
        }
        setBudgets(
          Array.isArray(data.budgets)
            ? (data.budgets as BudgetProgressView[])
            : []
        );
        hasHydratedBudgetsRef.current = true;
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError") ||
          seq !== budgetSeqRef.current
        ) {
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Gagal memuat data anggaran.";
        setBudgetError(msg);
        toast.error(msg);
      } finally {
        if (!controller.signal.aborted && seq === budgetSeqRef.current) {
          setLoadingBudgets(false);
          setRefreshingBudgets(false);
        }
      }
    },
    []
  );

  const fetchGoalsAndMeta = useCallback(async (background = false) => {
    goalsAbortRef.current?.abort();
    const controller = new AbortController();
    goalsAbortRef.current = controller;
    const seq = ++goalsSeqRef.current;

    if (!background) {
      setLoadingGoals(true);
    }
    setGoalsError(null);

    try {
      const [goalsRes, walletsRes, catsRes] = await Promise.all([
        fetch("/api/goals", { cache: "no-store", signal: controller.signal }),
        fetch("/api/wallets", { cache: "no-store", signal: controller.signal }),
        fetch("/api/categories?type=expense", {
          cache: "no-store",
          signal: controller.signal,
        }),
      ]);

      const [goalsData, walletsData, catsData] = await Promise.all([
        goalsRes.json().catch(() => ({})),
        walletsRes.json().catch(() => ({})),
        catsRes.json().catch(() => ({})),
      ]);

      if (controller.signal.aborted || seq !== goalsSeqRef.current) {
        return;
      }

      if (!goalsRes.ok) {
        throw new Error(goalsData.error ?? "Gagal memuat target tabungan.");
      }

      setGoals(
        Array.isArray(goalsData.goals)
          ? (goalsData.goals as SavingsGoalView[])
          : []
      );
      if (walletsRes.ok && Array.isArray(walletsData.wallets)) {
        setWallets(walletsData.wallets as WalletWithRole[]);
      }
      if (catsRes.ok && Array.isArray(catsData.categories)) {
        setExpenseCategories(catsData.categories as CategoryRecord[]);
      }
      hasHydratedGoalsRef.current = true;
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        seq !== goalsSeqRef.current
      ) {
        return;
      }
      const msg =
        err instanceof Error ? err.message : "Gagal memuat target tabungan.";
      setGoalsError(msg);
      toast.error(msg);
    } finally {
      if (!controller.signal.aborted && seq === goalsSeqRef.current) {
        setLoadingGoals(false);
      }
    }
  }, []);

  // Keep monthly budgets synced with selected month and global Quick-Add refreshes
  useEffect(() => {
    if (
      !hasLeftInitialBudgetsStateRef.current &&
      month === initialMonth &&
      refreshTrigger === 0
    ) {
      return;
    }
    hasLeftInitialBudgetsStateRef.current = true;
    void fetchBudgets(month, hasHydratedBudgetsRef.current);
    return () => {
      budgetAbortRef.current?.abort();
    };
  }, [month, initialMonth, refreshTrigger, fetchBudgets]);

  // Keep goals, wallets, and expense categories synced with global Quick-Add refreshes
  useEffect(() => {
    if (refreshTrigger === 0) {
      return;
    }
    void fetchGoalsAndMeta(hasHydratedGoalsRef.current);
    return () => {
      goalsAbortRef.current?.abort();
    };
  }, [refreshTrigger, fetchGoalsAndMeta]);

  // Budget Modal handlers
  function openCreateBudgetModal() {
    setEditingBudget(null);
    const existingIds = new Set(budgets.map((b) => b.categoryId));
    const firstUnset =
      expenseCategories.find((c) => !existingIds.has(c.id)) ??
      expenseCategories[0];
    setBudgetCategoryId(firstUnset?.id ?? "");
    setBudgetLimitDigits("");
    setBudgetFormError(null);
    setBudgetModalOpen(true);
  }

  function openEditBudgetModal(item: BudgetProgressView) {
    setEditingBudget(item);
    setBudgetCategoryId(item.categoryId);
    setBudgetLimitDigits(String(item.limitAmount));
    setBudgetFormError(null);
    setBudgetModalOpen(true);
  }

  async function handleSaveBudget(event: React.FormEvent) {
    event.preventDefault();
    setBudgetFormError(null);

    if (!budgetCategoryId) {
      setBudgetFormError("Pilih kategori pengeluaran terlebih dahulu.");
      return;
    }

    const limitAmount = Number(budgetLimitDigits);
    if (!Number.isSafeInteger(limitAmount) || limitAmount <= 0) {
      setBudgetFormError("Batas anggaran harus lebih dari Rp 0.");
      return;
    }

    setSavingBudget(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: budgetCategoryId,
          month,
          limitAmount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal menyimpan anggaran.";
        setBudgetFormError(msg);
        toast.error(msg);
        return;
      }

      toast.success(
        editingBudget
          ? `Batas anggaran ${editingBudget.categoryName} diperbarui.`
          : "Anggaran bulanan berhasil disimpan."
      );
      setBudgetModalOpen(false);
      await fetchBudgets(month, true);
    } catch {
      const msg = "Terjadi gangguan jaringan saat menyimpan anggaran.";
      setBudgetFormError(msg);
      toast.error(msg);
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleCopyPreviousMonth() {
    setCopyingBudgets(true);
    try {
      const res = await fetch("/api/budgets/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menyalin anggaran dari bulan lalu.");
        return;
      }

      const copiedCount = Number(data.copiedCount ?? 0);
      if (copiedCount > 0) {
        toast.success(
          `Berhasil menyalin ${copiedCount} anggaran dari ${formatMonthID(getPreviousMonthYM(month))}.`
        );
        await fetchBudgets(month, true);
      } else {
        toast.info(
          `Tidak ada anggaran baru untuk disalin dari ${formatMonthID(getPreviousMonthYM(month))}.`
        );
      }
    } catch {
      toast.error("Terjadi gangguan jaringan saat menyalin anggaran.");
    } finally {
      setCopyingBudgets(false);
    }
  }

  async function handleConfirmDeleteBudget() {
    if (!deleteBudgetTarget) {
      return;
    }
    setDeletingBudget(true);
    try {
      const res = await fetch(
        `/api/budgets/${encodeURIComponent(deleteBudgetTarget.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menghapus anggaran.");
        return;
      }
      toast.success(
        `Anggaran "${deleteBudgetTarget.categoryName}" berhasil dihapus.`
      );
      setDeleteBudgetTarget(null);
      await fetchBudgets(month, true);
    } catch {
      toast.error("Terjadi gangguan jaringan saat menghapus anggaran.");
    } finally {
      setDeletingBudget(false);
    }
  }

  // Goal Create / Edit handlers
  function openCreateGoalModal() {
    setEditingGoal(null);
    setGoalName("");
    setGoalTargetDigits("");
    setGoalInitialDigits("0");
    setGoalWalletId("");
    setGoalDeadline("");
    setGoalNotes("");
    setGoalFormError(null);
    setGoalModalOpen(true);
  }

  function openEditGoalModal(goal: SavingsGoalView) {
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalTargetDigits(String(goal.targetAmount));
    setGoalInitialDigits(String(goal.currentAmount));
    setGoalWalletId(goal.walletId ?? "");
    setGoalDeadline(goal.deadline ?? "");
    setGoalNotes(goal.notes ?? "");
    setGoalFormError(null);
    setGoalModalOpen(true);
  }

  async function handleSaveGoal(event: React.FormEvent) {
    event.preventDefault();
    setGoalFormError(null);

    const trimmedName = goalName.trim();
    if (!trimmedName) {
      setGoalFormError("Nama target tabungan wajib diisi.");
      return;
    }

    const targetAmount = Number(goalTargetDigits);
    if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
      setGoalFormError("Target nominal harus lebih dari Rp 0.");
      return;
    }

    const initialAmount =
      goalInitialDigits === "" ? 0 : Number(goalInitialDigits);
    if (!editingGoal && (!Number.isSafeInteger(initialAmount) || initialAmount < 0)) {
      setGoalFormError("Saldo awal harus berupa bilangan bulat minimal Rp 0.");
      return;
    }

    setSavingGoal(true);
    try {
      const payload = editingGoal
        ? {
            name: trimmedName,
            targetAmount,
            walletId: goalWalletId || null,
            deadline: goalDeadline.trim() || null,
            notes: goalNotes.trim() || null,
          }
        : {
            name: trimmedName,
            targetAmount,
            currentAmount: initialAmount,
            walletId: goalWalletId || null,
            deadline: goalDeadline.trim() || null,
            notes: goalNotes.trim() || null,
          };

      const res = await fetch(
        editingGoal
          ? `/api/goals/${encodeURIComponent(editingGoal.id)}`
          : "/api/goals",
        {
          method: editingGoal ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal menyimpan target tabungan.";
        setGoalFormError(msg);
        toast.error(msg);
        return;
      }

      toast.success(
        editingGoal
          ? `Target "${trimmedName}" berhasil diperbarui.`
          : `Target "${trimmedName}" berhasil dibuat.`
      );
      setGoalModalOpen(false);
      await fetchGoalsAndMeta(true);
    } catch {
      const msg = "Terjadi gangguan jaringan saat menyimpan target tabungan.";
      setGoalFormError(msg);
      toast.error(msg);
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleConfirmDeleteGoal() {
    if (!deleteGoalTarget) {
      return;
    }
    setDeletingGoal(true);
    try {
      const res = await fetch(
        `/api/goals/${encodeURIComponent(deleteGoalTarget.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menghapus target tabungan.");
        return;
      }
      toast.success(
        `Target tabungan "${deleteGoalTarget.name}" berhasil dihapus.`
      );
      setDeleteGoalTarget(null);
      await fetchGoalsAndMeta(true);
    } catch {
      toast.error("Terjadi gangguan jaringan saat menghapus target tabungan.");
    } finally {
      setDeletingGoal(false);
    }
  }

  // Dual-Mode Deposit Modal handlers
  function openDepositModal(goal: SavingsGoalView) {
    setDepositGoal(goal);
    const defaultMode =
      writableWallets.length > 0 ? "wallet_transfer" : "virtual";
    setDepositMode(defaultMode);
    setDepositAmountDigits("");
    const preferredSource =
      writableWallets.find((w) => w.id !== goal.walletId) ?? writableWallets[0];
    setDepositSourceWalletId(preferredSource?.id ?? "");
    setDepositDate(getTodayISO());
    setDepositNotes("");
    setDepositFormError(null);
  }

  async function handleDepositGoal(event: React.FormEvent) {
    event.preventDefault();
    if (!depositGoal) {
      return;
    }
    setDepositFormError(null);

    const amount = Number(depositAmountDigits);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setDepositFormError("Nominal setoran harus lebih dari Rp 0.");
      return;
    }

    if (depositMode === "wallet_transfer") {
      if (!depositSourceWalletId) {
        setDepositFormError("Pilih dompet sumber terlebih dahulu.");
        return;
      }
      if (!depositDate) {
        setDepositFormError("Tanggal setoran wajib diisi.");
        return;
      }
    }

    setDepositing(true);
    try {
      const res = await fetch(
        `/api/goals/${encodeURIComponent(depositGoal.id)}/deposit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            depositMode === "wallet_transfer"
              ? {
                  amount,
                  mode: "wallet_transfer",
                  sourceWalletId: depositSourceWalletId,
                  occurredAt: depositDate,
                  notes: depositNotes.trim() || null,
                }
              : {
                  amount,
                  mode: "virtual",
                  notes: depositNotes.trim() || null,
                }
          ),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal mencatat setoran target.";
        setDepositFormError(msg);
        toast.error(msg);
        return;
      }

      toast.success(
        depositMode === "wallet_transfer"
          ? `Setoran ${formatIDR(amount)} berhasil dicatat dari dompet.`
          : `Progres tabungan bertambah ${formatIDR(amount)}.`
      );
      setDepositGoal(null);
      triggerRefresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat mencatat setoran.";
      setDepositFormError(msg);
      toast.error(msg);
    } finally {
      setDepositing(false);
    }
  }

  const existingBudgetCategoryIds = useMemo(
    () => new Set(budgets.map((b) => b.categoryId)),
    [budgets]
  );

  const selectedCategoryAlreadyHasBudget =
    !editingBudget &&
    Boolean(budgetCategoryId) &&
    existingBudgetCategoryIds.has(budgetCategoryId);

  return (
    <div className="space-y-10">
      {/* Page Title */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#78716C]">
            Perencanaan Keuangan
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Anggaran &amp; Target Tabungan
          </h1>
          <p className="mt-1 text-sm text-[#78716C]">
            Tetapkan batas belanja bulanan per kategori dan capai target dana
            keluarga secara terukur.
          </p>
        </div>
      </div>

      {/* BAGIAN 1 — ANGGARAN BULANAN */}
      <section aria-labelledby="heading-anggaran" className="space-y-5">
        <Card padding="md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2
                id="heading-anggaran"
                className="font-display text-xl font-medium text-[#1C1917]"
              >
                Anggaran Bulanan
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-[#78716C]">
                Realisasi pengeluaran dihitung otomatis dari seluruh dompet
                milik Anda (tidak termasuk transfer internal).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Month Navigator */}
              <div className="inline-flex items-center gap-1 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMonth((m) => getPreviousMonthYM(m))}
                  aria-label="Bulan sebelumnya"
                  className="h-8 px-2.5 text-[#1C1917]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Bulan Sebelumnya</span>
                </Button>

                <span className="tnum px-3 text-sm font-semibold text-[#1C1917] min-w-[138px] text-center">
                  {formatMonthID(month)}
                </span>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMonth((m) => getNextMonthYM(m))}
                  aria-label="Bulan berikutnya"
                  className="h-8 px-2.5 text-[#1C1917]"
                >
                  <span className="hidden sm:inline">Bulan Berikutnya</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {month !== currentMonth && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMonth(currentMonth)}
                >
                  Bulan Ini
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E7E2D8] pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="inflow">
                <span className="tnum">Aman: {budgetSummary.safeCount}</span>
              </Badge>
              <Badge variant="warning">
                <span className="tnum">
                  Waspada: {budgetSummary.warningCount}
                </span>
              </Badge>
              <Badge variant="outflow">
                <span className="tnum">
                  Melewati: {budgetSummary.exceededCount}
                </span>
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={copyingBudgets}
                onClick={() => void handleCopyPreviousMonth()}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Salin dari Bulan Lalu</span>
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={openCreateBudgetModal}
              >
                <Plus className="h-4 w-4" />
                <span>Atur Anggaran</span>
              </Button>
            </div>
          </div>

          {/* Summary Bar */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/60 px-4 py-3">
              <p className="text-xs font-medium text-[#78716C]">
                Total Batas Anggaran
              </p>
              <p className="tnum font-display mt-1 text-xl sm:text-2xl font-medium text-[#1C1917]">
                {formatIDR(budgetSummary.totalLimit)}
              </p>
            </div>
            <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/60 px-4 py-3">
              <p className="text-xs font-medium text-[#78716C]">
                Total Terpakai
              </p>
              <p className="tnum font-display mt-1 text-xl sm:text-2xl font-medium text-[#B91C1C]">
                {formatIDR(budgetSummary.totalSpent)}
              </p>
            </div>
            <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/60 px-4 py-3">
              <p className="text-xs font-medium text-[#78716C]">
                {budgetSummary.totalRemaining >= 0
                  ? "Sisa Anggaran"
                  : "Kelebihan Pengeluaran"}
              </p>
              <p
                className={cn(
                  "tnum font-display mt-1 text-xl sm:text-2xl font-medium",
                  budgetSummary.totalRemaining >= 0
                    ? "text-[#15803D]"
                    : "text-[#B91C1C]"
                )}
              >
                {budgetSummary.totalRemaining >= 0
                  ? formatIDR(budgetSummary.totalRemaining)
                  : formatIDR(Math.abs(budgetSummary.totalRemaining))}
              </p>
            </div>
          </div>
        </Card>

        {loadingBudgets && budgets.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        ) : budgetError && budgets.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              title="Anggaran gagal dimuat"
              description={budgetError}
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void fetchBudgets(month)}
                >
                  Coba Lagi
                </Button>
              }
            />
          </Card>
        ) : budgets.length === 0 ? (
          <Card padding="md">
            <EmptyState
              icon={<PiggyBank className="h-5 w-5" />}
              title={`Belum ada anggaran di ${formatMonthID(month)}`}
              description="Atur batas pengeluaran per kategori atau salin langsung dari pengaturan bulan sebelumnya."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={copyingBudgets}
                    onClick={() => void handleCopyPreviousMonth()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin dari Bulan Lalu</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={openCreateBudgetModal}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Atur Anggaran</span>
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <div
            className={cn(
              "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 transition-opacity",
              (loadingBudgets || refreshingBudgets) && "opacity-65"
            )}
          >
            {budgets.map((budget) => {
              const meta = getBudgetStatusMeta(budget.status);
              const barWidth = Math.min(100, Math.max(0, budget.percentage));
              const isOver = budget.remainingAmount < 0;

              return (
                <Card
                  key={budget.id}
                  padding="md"
                  interactive
                  className="flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: budget.categoryColor }}
                        />
                        <h3 className="truncate text-sm font-semibold text-[#1C1917]">
                          {budget.categoryName}
                        </h3>
                      </div>

                      <Badge variant={meta.badgeVariant}>
                        <span className="tnum">
                          {meta.label} · {budget.percentage}%
                        </span>
                      </Badge>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          meta.barColor
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2 text-[#57534E]">
                        <span>Terpakai</span>
                        <span className="tnum font-semibold text-[#1C1917]">
                          {formatIDR(budget.spentAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[#57534E]">
                        <span>Batas Anggaran</span>
                        <span className="tnum font-medium text-[#1C1917]">
                          {formatIDR(budget.limitAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-[#E7E2D8] pt-1.5 mt-1.5">
                        <span className="text-[#78716C]">
                          {isOver ? "Melebihi batas" : "Sisa anggaran"}
                        </span>
                        <span
                          className={cn(
                            "tnum font-semibold",
                            isOver ? "text-[#B91C1C]" : "text-[#15803D]"
                          )}
                        >
                          {isOver
                            ? formatIDR(Math.abs(budget.remainingAmount))
                            : formatIDR(budget.remainingAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 border-t border-[#E7E2D8] pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEditBudgetModal(budget)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[#B91C1C] hover:bg-[#FEE2E2]/55 hover:text-[#B91C1C]"
                      onClick={() => setDeleteBudgetTarget(budget)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus</span>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* BAGIAN 2 — TARGET TABUNGAN */}
      <section aria-labelledby="heading-target" className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="heading-target"
              className="font-display text-xl sm:text-2xl font-medium text-[#1C1917]"
            >
              Target Tabungan
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-[#78716C]">
              Catat setoran dari dompet aktif maupun progres tabungan di luar
              aplikasi.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={openCreateGoalModal}>
            <Plus className="h-4 w-4" />
            <span>Buat Target Tabungan</span>
          </Button>
        </div>

        {loadingGoals && goals.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
        ) : goalsError && goals.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              title="Target tabungan gagal dimuat"
              description={goalsError}
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void fetchGoalsAndMeta()}
                >
                  Coba Lagi
                </Button>
              }
            />
          </Card>
        ) : goals.length === 0 ? (
          <Card padding="md">
            <EmptyState
              icon={<Target className="h-5 w-5" />}
              title="Belum ada target tabungan"
              description="Buat target dana darurat, biaya pendidikan, atau rencana keluarga lainnya untuk memantau progres secara konsisten."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={openCreateGoalModal}
                >
                  <Plus className="h-4 w-4" />
                  <span>Buat Target Tabungan</span>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {goals.map((goal) => {
              const barWidth = Math.min(100, Math.max(0, goal.percentage));
              const achieved = goal.currentAmount >= goal.targetAmount;

              return (
                <Card
                  key={goal.id}
                  padding="md"
                  interactive
                  className="flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-lg font-medium text-[#1C1917] leading-snug">
                          {goal.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {goal.walletName ? (
                            <Badge variant="neutral">
                              <WalletIcon className="h-3 w-3" />
                              <span>{goal.walletName}</span>
                            </Badge>
                          ) : (
                            <Badge variant="neutral">Progres Terpisah</Badge>
                          )}
                          {goal.deadline && (
                            <Badge variant="neutral">
                              <Calendar className="h-3 w-3" />
                              <span className="tnum">
                                Tenggat {formatDateID(goal.deadline)}
                              </span>
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Badge variant={achieved ? "forest" : "inflow"}>
                        <span className="tnum">
                          {achieved ? "Tercapai · " : ""}
                          {goal.percentage}%
                        </span>
                      </Badge>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          achieved ? "bg-[#15803D]" : "bg-[#14532D]"
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/60 px-3 py-2.5 text-xs">
                      <div>
                        <p className="text-[#78716C]">Terkumpul</p>
                        <p className="tnum mt-0.5 font-semibold text-[#14532D]">
                          {formatIDR(goal.currentAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#78716C]">Target</p>
                        <p className="tnum mt-0.5 font-semibold text-[#1C1917]">
                          {formatIDR(goal.targetAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#78716C]">Sisa Target</p>
                        <p className="tnum mt-0.5 font-semibold text-[#57534E]">
                          {goal.remainingAmount === 0
                            ? "Lunas"
                            : formatIDR(goal.remainingAmount)}
                        </p>
                      </div>
                    </div>

                    {goal.notes && (
                      <p className="text-xs text-[#57534E] leading-relaxed">
                        {goal.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E7E2D8] pt-3">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openDepositModal(goal)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Tambah Setoran</span>
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditGoalModal(goal)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[#B91C1C] hover:bg-[#FEE2E2]/55 hover:text-[#B91C1C]"
                        onClick={() => setDeleteGoalTarget(goal)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Atur / Edit Anggaran */}
      <Modal
        open={budgetModalOpen}
        onClose={() => !savingBudget && setBudgetModalOpen(false)}
        title={
          editingBudget
            ? `Edit Anggaran — ${editingBudget.categoryName}`
            : `Atur Anggaran (${formatMonthID(month)})`
        }
        description="Tentukan batas pengeluaran bulanan untuk kategori pengeluaran Anda."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={savingBudget}
              onClick={() => setBudgetModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="budget-form"
              variant="primary"
              size="sm"
              loading={savingBudget}
              disabled={expenseCategories.length === 0}
            >
              Simpan Anggaran
            </Button>
          </div>
        }
      >
        <form
          id="budget-form"
          onSubmit={handleSaveBudget}
          noValidate
          className="space-y-4"
        >
          {budgetFormError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {budgetFormError}
            </div>
          )}

          {expenseCategories.length === 0 ? (
            <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-4 text-xs text-[#57534E] space-y-2">
              <p>Belum ada kategori pengeluaran tersedia.</p>
              <Link
                href="/pengaturan"
                className="inline-block font-semibold text-[#14532D] hover:underline"
              >
                Kelola Kategori di Pengaturan →
              </Link>
            </div>
          ) : (
            <>
              <Select
                label="Kategori Pengeluaran"
                required
                value={budgetCategoryId}
                disabled={Boolean(editingBudget) || savingBudget}
                onChange={(e) => setBudgetCategoryId(e.target.value)}
                hint={
                  selectedCategoryAlreadyHasBudget
                    ? `Kategori ini sudah memiliki anggaran pada ${formatMonthID(month)}. Menyimpan akan memperbarui batasnya.`
                    : undefined
                }
              >
                <option value="">Pilih kategori...</option>
                {expenseCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                    {!editingBudget && existingBudgetCategoryIds.has(cat.id)
                      ? " (Sudah diatur)"
                      : ""}
                  </option>
                ))}
              </Select>

              <div>
                <label
                  htmlFor="budget-limit-input"
                  className="mb-1.5 block text-xs font-medium text-[#57534E]"
                >
                  Batas Anggaran Bulanan <span className="text-[#B91C1C]">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#78716C]">
                    Rp
                  </span>
                  <input
                    id="budget-limit-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="1.500.000"
                    disabled={savingBudget}
                    value={formatDigitsIDR(budgetLimitDigits)}
                    onChange={(e) =>
                      setBudgetLimitDigits(sanitizePositiveDigits(e.target.value))
                    }
                    className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-10 pr-3.5 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                  />
                </div>
              </div>
            </>
          )}
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Anggaran */}
      <Modal
        open={Boolean(deleteBudgetTarget)}
        onClose={() => !deletingBudget && setDeleteBudgetTarget(null)}
        title="Hapus Anggaran?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={deletingBudget}
              onClick={() => setDeleteBudgetTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deletingBudget}
              onClick={() => void handleConfirmDeleteBudget()}
            >
              Ya, Hapus
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#57534E] leading-relaxed">
          Anggaran kategori{" "}
          <strong className="text-[#1C1917]">
            {deleteBudgetTarget?.categoryName}
          </strong>{" "}
          untuk bulan{" "}
          <strong className="text-[#1C1917]">{formatMonthID(month)}</strong>{" "}
          akan dihapus. Catatan transaksi Anda tetap tersimpan.
        </p>
      </Modal>

      {/* Modal Buat / Edit Target Tabungan */}
      <Modal
        open={goalModalOpen}
        onClose={() => !savingGoal && setGoalModalOpen(false)}
        title={
          editingGoal ? "Edit Target Tabungan" : "Buat Target Tabungan Baru"
        }
        description="Tentukan nominal sasaran dan hubungkan ke dompet bila diinginkan."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={savingGoal}
              onClick={() => setGoalModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="goal-form"
              variant="primary"
              size="sm"
              loading={savingGoal}
            >
              {editingGoal ? "Simpan Perubahan" : "Simpan Target"}
            </Button>
          </div>
        }
      >
        <form
          id="goal-form"
          onSubmit={handleSaveGoal}
          noValidate
          className="space-y-4"
        >
          {goalFormError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {goalFormError}
            </div>
          )}

          <Input
            label="Nama Target Tabungan"
            required
            maxLength={80}
            placeholder="Contoh: Dana Darurat Keluarga"
            disabled={savingGoal}
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
          />

          <div
            className={cn(
              "grid grid-cols-1 gap-4",
              !editingGoal && "sm:grid-cols-2"
            )}
          >
            <div>
              <label
                htmlFor="goal-target-input"
                className="mb-1.5 block text-xs font-medium text-[#57534E]"
              >
                Target Nominal <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#78716C]">
                  Rp
                </span>
                <input
                  id="goal-target-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="25.000.000"
                  disabled={savingGoal}
                  value={formatDigitsIDR(goalTargetDigits)}
                  onChange={(e) =>
                    setGoalTargetDigits(sanitizePositiveDigits(e.target.value))
                  }
                  className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-10 pr-3.5 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                />
              </div>
            </div>

            {!editingGoal && (
              <div>
                <label
                  htmlFor="goal-initial-input"
                  className="mb-1.5 block text-xs font-medium text-[#57534E]"
                >
                  Saldo Awal (Opsional)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#78716C]">
                    Rp
                  </span>
                  <input
                    id="goal-initial-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    disabled={savingGoal}
                    value={formatDigitsIDR(goalInitialDigits)}
                    onChange={(e) =>
                      setGoalInitialDigits(
                        sanitizeNonNegativeDigits(e.target.value)
                      )
                    }
                    className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-10 pr-3.5 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Hubungkan ke Dompet (Opsional)"
              disabled={savingGoal}
              value={goalWalletId}
              onChange={(e) => setGoalWalletId(e.target.value)}
            >
              <option value="">Tidak dihubungkan</option>
              {editingGoal?.walletId &&
                !writableWallets.some((w) => w.id === editingGoal.walletId) && (
                  <option value={editingGoal.walletId}>
                    {editingGoal.walletName ?? "Dompet Terhubung"} (Tidak aktif)
                  </option>
                )}
              {writableWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatIDR(w.balance)})
                </option>
              ))}
            </Select>

            <Input
              label="Tenggat Waktu (Opsional)"
              type="date"
              disabled={savingGoal}
              value={goalDeadline}
              onChange={(e) => setGoalDeadline(e.target.value)}
            />
          </div>

          <Textarea
            label="Catatan (Opsional)"
            maxLength={500}
            rows={2}
            placeholder="Tujuan penggunaan dana atau rencana setoran bulanan..."
            disabled={savingGoal}
            value={goalNotes}
            onChange={(e) => setGoalNotes(e.target.value)}
          />
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Target Tabungan */}
      <Modal
        open={Boolean(deleteGoalTarget)}
        onClose={() => !deletingGoal && setDeleteGoalTarget(null)}
        title="Hapus Target Tabungan?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={deletingGoal}
              onClick={() => setDeleteGoalTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deletingGoal}
              onClick={() => void handleConfirmDeleteGoal()}
            >
              Ya, Hapus
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#57534E] leading-relaxed">
          Target tabungan{" "}
          <strong className="text-[#1C1917]">{deleteGoalTarget?.name}</strong>{" "}
          akan dihapus permanen. Transaksi dompet yang sudah tercatat
          sebelumnya tidak akan terhapus.
        </p>
      </Modal>

      {/* Modal Dual-Mode + Tambah Setoran */}
      <Modal
        open={Boolean(depositGoal)}
        onClose={() => !depositing && setDepositGoal(null)}
        title={`Tambah Setoran — ${depositGoal?.name ?? ""}`}
        description="Pilih sumber setoran dari dompet aktif atau catat progres tabungan luar aplikasi."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={depositing}
              onClick={() => setDepositGoal(null)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="deposit-goal-form"
              variant="primary"
              size="sm"
              loading={depositing}
              disabled={
                depositMode === "wallet_transfer" && writableWallets.length === 0
              }
            >
              Simpan Setoran
            </Button>
          </div>
        }
      >
        {depositGoal && (
          <form
            id="deposit-goal-form"
            onSubmit={handleDepositGoal}
            noValidate
            className="space-y-4"
          >
            <div className="flex items-center justify-between rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] px-4 py-3 text-xs">
              <span className="text-[#57534E]">Progres saat ini</span>
              <span className="tnum font-semibold text-[#1C1917]">
                {formatIDR(depositGoal.currentAmount)} /{" "}
                {formatIDR(depositGoal.targetAmount)} ({depositGoal.percentage}
                %)
              </span>
            </div>

            {depositFormError && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
              >
                {depositFormError}
              </div>
            )}

            {/* Mode Picker */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[#57534E]">
                Metode Setoran <span className="text-[#B91C1C]">*</span>
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={depositing}
                  onClick={() => {
                    setDepositMode("wallet_transfer");
                    setDepositFormError(null);
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors cursor-pointer",
                    depositMode === "wallet_transfer"
                      ? "border-[#14532D] bg-[#DCFCE7]/35 ring-1 ring-[#14532D]"
                      : "border-[#E7E2D8] bg-[#FFFFFF] hover:bg-[#F7F5F0]"
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
                    <ArrowLeftRight className="h-4 w-4 text-[#14532D]" />
                    <span>Transfer dari Dompet</span>
                  </div>
                  <p className="mt-1 text-xs text-[#78716C] leading-snug">
                    Mengurangi saldo dompet sumber dan tercatat di buku
                    transaksi.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={depositing}
                  onClick={() => {
                    setDepositMode("virtual");
                    setDepositFormError(null);
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors cursor-pointer",
                    depositMode === "virtual"
                      ? "border-[#14532D] bg-[#DCFCE7]/35 ring-1 ring-[#14532D]"
                      : "border-[#E7E2D8] bg-[#FFFFFF] hover:bg-[#F7F5F0]"
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
                    <PiggyBank className="h-4 w-4 text-[#14532D]" />
                    <span>Catat Progres Saja</span>
                  </div>
                  <p className="mt-1 text-xs text-[#78716C] leading-snug">
                    Untuk tabungan di luar aplikasi tanpa memotong saldo dompet.
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="deposit-amount-input"
                className="mb-1.5 block text-xs font-medium text-[#57534E]"
              >
                Nominal Setoran <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#78716C]">
                  Rp
                </span>
                <input
                  id="deposit-amount-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="500.000"
                  disabled={depositing}
                  value={formatDigitsIDR(depositAmountDigits)}
                  onChange={(e) =>
                    setDepositAmountDigits(sanitizePositiveDigits(e.target.value))
                  }
                  className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-10 pr-3.5 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                />
              </div>
            </div>

            {depositMode === "wallet_transfer" && (
              <div className="space-y-4">
                {writableWallets.length === 0 ? (
                  <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/45 p-3 text-xs text-[#92400E]">
                    Anda belum memiliki dompet aktif dengan izin tulis. Pilih
                    mode <strong>Catat Progres Saja</strong> atau buat dompet
                    terlebih dahulu.
                  </div>
                ) : (
                  <>
                    <Select
                      label="Dompet Sumber"
                      required
                      disabled={depositing}
                      value={depositSourceWalletId}
                      onChange={(e) => setDepositSourceWalletId(e.target.value)}
                      hint={
                        depositGoal.walletId &&
                        depositSourceWalletId &&
                        depositGoal.walletId !== depositSourceWalletId
                          ? `Akan dicatat sebagai transfer menuju dompet ${depositGoal.walletName ?? "target"}.`
                          : "Akan dicatat sebagai pengeluaran kategori Tabungan & Investasi."
                      }
                    >
                      <option value="">Pilih dompet sumber...</option>
                      {writableWallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({formatIDR(w.balance)})
                        </option>
                      ))}
                    </Select>

                    <Input
                      label="Tanggal Setoran"
                      type="date"
                      required
                      disabled={depositing}
                      value={depositDate}
                      onChange={(e) => setDepositDate(e.target.value)}
                    />
                  </>
                )}
              </div>
            )}

            <Textarea
              label="Catatan (Opsional)"
              maxLength={500}
              rows={2}
              placeholder="Contoh: Sisihan gaji bulan ini"
              disabled={depositing}
              value={depositNotes}
              onChange={(e) => setDepositNotes(e.target.value)}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
