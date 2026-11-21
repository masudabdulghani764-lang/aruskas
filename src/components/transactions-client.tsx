"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Paperclip,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Share2,
  SkipForward,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import { ReceiptDrawer } from "@/components/receipt-drawer";
import { SplitBillModal } from "@/components/split-bill-modal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  SkeletonCard,
  cn,
} from "@/components/ui/primitives";
import {
  formatDateID,
  formatIDR,
  getCurrentMonthYM,
  getPreviousMonthYM,
  getTodayISO,
} from "@/lib/format";
import type { RecurringFrequency, RecurringRuleView, RecurringType } from "@/lib/recurring";
import type { SplitBillView } from "@/lib/split-bills";
import type { TransactionType, TransactionView } from "@/lib/transactions";
import type { WalletWithRole } from "@/lib/wallets";

type ActiveTab = "history" | "recurring" | "patungan";
type PeriodPreset = "this_month" | "last_month" | "three_months" | "this_year" | "custom";

interface CategoryOption {
  id: string;
  userId: string;
  name: string;
  type: "income" | "expense";
  color: string;
}

interface TransactionsSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
}

function getMonthEndISO(ym: string): string {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(lastDay).padStart(2, "0")}`;
}

function resolvePresetRange(preset: Exclude<PeriodPreset, "custom">): {
  from: string;
  to: string;
} {
  const currentYM = getCurrentMonthYM();
  if (preset === "this_month") {
    return { from: `${currentYM}-01`, to: getMonthEndISO(currentYM) };
  }
  if (preset === "last_month") {
    const prev = getPreviousMonthYM(currentYM);
    return { from: `${prev}-01`, to: getMonthEndISO(prev) };
  }
  if (preset === "three_months") {
    const m2 = getPreviousMonthYM(getPreviousMonthYM(currentYM));
    return { from: `${m2}-01`, to: getMonthEndISO(currentYM) };
  }
  const year = currentYM.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function formatDigitsIDR(digits: string): string {
  if (!digits) {
    return "";
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Buku Transaksi client view with filtered transaction ledger, ReceiptDrawer inspection,
 * and recurring transaction rules management.
 */
export function TransactionsClient({
  initialTab = "history",
  currentUserId,
  initialFrom,
  initialTo,
  initialWallets,
  initialCategories,
  initialItems,
  initialSummary,
  initialRules,
  initialSplitBills,
}: {
  initialTab?: ActiveTab;
  currentUserId: string;
  initialFrom?: string;
  initialTo?: string;
  initialWallets?: WalletWithRole[];
  initialCategories?: CategoryOption[];
  initialItems?: TransactionView[];
  initialSummary?: TransactionsSummary;
  initialRules?: RecurringRuleView[];
  initialSplitBills?: SplitBillView[];
}) {
  const { openQuickAdd, refreshTrigger, triggerRefresh } = useQuickAdd();

  const hasInitialMeta = initialWallets !== undefined && initialCategories !== undefined;
  const hasInitialTx = initialItems !== undefined && initialSummary !== undefined;
  const hasInitialRules = initialRules !== undefined;

  const [tab, setTab] = useState<ActiveTab>(initialTab);

  // Shared metadata (wallets & categories)
  const [wallets, setWallets] = useState<WalletWithRole[]>(initialWallets ?? []);
  const [ownCategories, setOwnCategories] = useState<CategoryOption[]>(
    initialCategories ?? []
  );
  const [filterCategories, setFilterCategories] = useState<CategoryOption[]>(
    initialCategories ?? []
  );

  // Ledger filters
  const defaultRange = useMemo(
    () =>
      initialFrom && initialTo
        ? { from: initialFrom, to: initialTo }
        : resolvePresetRange("this_month"),
    [initialFrom, initialTo]
  );
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [customFrom, setCustomFrom] = useState(defaultRange.from);
  const [customTo, setCustomTo] = useState(defaultRange.to);
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [walletFilter, setWalletFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Ledger state
  const [items, setItems] = useState<TransactionView[]>(initialItems ?? []);
  const [visibleCount, setVisibleCount] = useState<number>(40);
  const [summary, setSummary] = useState<TransactionsSummary>(
    initialSummary ?? {
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    }
  );
  const [loadingTx, setLoadingTx] = useState(!hasInitialTx);
  const [txError, setTxError] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );

  const groupedByDate = useMemo(() => {
    const todayIso = getTodayISO();
    const groups: Array<{
      date: string;
      label: string;
      dailyNet: number;
      rows: TransactionView[];
    }> = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const tx of visibleItems) {
      let group = map.get(tx.occurredAt);
      if (!group) {
        const prefix =
          tx.occurredAt === todayIso ? "Hari Ini · " : "";
        group = {
          date: tx.occurredAt,
          label: `${prefix}${formatDateID(tx.occurredAt)}`,
          dailyNet: 0,
          rows: [],
        };
        map.set(tx.occurredAt, group);
        groups.push(group);
      }
      if (tx.type === "income") {
        group.dailyNet += tx.amount;
      } else if (tx.type === "expense") {
        group.dailyNet -= tx.amount;
      }
      group.rows.push(tx);
    }

    return groups;
  }, [visibleItems]);

  // Receipt Drawer
  const [selectedTx, setSelectedTx] = useState<TransactionView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Recurring rules state
  const [rules, setRules] = useState<RecurringRuleView[]>(initialRules ?? []);
  const [loadingRules, setLoadingRules] = useState(!hasInitialRules);

  // Split bills state
  const [splitBills, setSplitBills] = useState<SplitBillView[]>(
    initialSplitBills ?? []
  );
  const [splitBillModalOpen, setSplitBillModalOpen] = useState(false);
  const [busySplitId, setBusySplitId] = useState<string | null>(null);
  const [copiedSplitSlug, setCopiedSplitSlug] = useState<string | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [overrideDigits, setOverrideDigits] = useState<Record<string, string>>(
    {}
  );
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(
    null
  );

  // Add recurring modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [recType, setRecType] = useState<RecurringType>("expense");
  const [recTitle, setRecTitle] = useState("");
  const [recAmountDigits, setRecAmountDigits] = useState("");
  const [recWalletId, setRecWalletId] = useState("");
  const [recCategoryId, setRecCategoryId] = useState("");
  const [recFrequency, setRecFrequency] = useState<RecurringFrequency>("monthly");
  const [recNextRunDate, setRecNextRunDate] = useState(() => getTodayISO());
  const [creatingRule, setCreatingRule] = useState(false);
  const [createRuleError, setCreateRuleError] = useState<string | null>(null);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load wallets and user's own categories
  const loadMeta = useCallback(async () => {
    try {
      const [walletsRes, catsRes] = await Promise.all([
        fetch("/api/wallets", { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
      ]);
      const walletsData = await walletsRes.json().catch(() => ({}));
      const catsData = await catsRes.json().catch(() => ({}));

      if (walletsRes.ok && Array.isArray(walletsData.wallets)) {
        setWallets(walletsData.wallets as WalletWithRole[]);
      }
      if (catsRes.ok && Array.isArray(catsData.categories)) {
        const list = catsData.categories as CategoryOption[];
        setOwnCategories(list);
      }
    } catch {
      // Non-fatal metadata load failure handled on individual views
    }
  }, []);

  useEffect(() => {
    if (hasInitialMeta && refreshTrigger === 0) {
      return;
    }
    void loadMeta();
  }, [loadMeta, refreshTrigger, hasInitialMeta]);

  // Sync filterCategories when walletFilter changes (supports shared wallet owner categories)
  useEffect(() => {
    const selectedWallet = wallets.find((w) => w.id === walletFilter);
    if (!selectedWallet || selectedWallet.ownerId === currentUserId) {
      setFilterCategories(ownCategories);
      return;
    }

    let cancelled = false;
    fetch(
      `/api/categories?ownerId=${encodeURIComponent(selectedWallet.ownerId)}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.categories)) {
          setFilterCategories(data.categories as CategoryOption[]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFilterCategories(ownCategories);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [walletFilter, wallets, currentUserId, ownCategories]);

  // Clear incompatible category filter when type changes
  const visibleFilterCategories = useMemo(() => {
    if (typeFilter === "transfer") {
      return [];
    }
    if (typeFilter === "income" || typeFilter === "expense") {
      return filterCategories.filter((c) => c.type === typeFilter);
    }
    return filterCategories;
  }, [filterCategories, typeFilter]);

  useEffect(() => {
    if (
      categoryFilter &&
      !visibleFilterCategories.some((c) => c.id === categoryFilter)
    ) {
      setCategoryFilter("");
    }
  }, [categoryFilter, visibleFilterCategories]);

  const activeRange = useMemo(() => {
    if (periodPreset === "custom") {
      return { from: customFrom, to: customTo };
    }
    return resolvePresetRange(periodPreset);
  }, [periodPreset, customFrom, customTo]);

  const dateRangeInvalid =
    Boolean(activeRange.from) &&
    Boolean(activeRange.to) &&
    activeRange.from > activeRange.to;

  // Fetch filtered transactions
  const txRequestSeqRef = useRef(0);
  const txAbortRef = useRef<AbortController | null>(null);

  const loadTransactions = useCallback(async () => {
    txAbortRef.current?.abort();
    const seq = ++txRequestSeqRef.current;

    if (dateRangeInvalid) {
      setTxError("Tanggal awal tidak boleh melebihi tanggal akhir.");
      setLoadingTx(false);
      return;
    }

    const controller = new AbortController();
    txAbortRef.current = controller;

    setLoadingTx(true);
    setTxError(null);

    try {
      const params = new URLSearchParams();
      if (activeRange.from) {
        params.set("from", activeRange.from);
      }
      if (activeRange.to) {
        params.set("to", activeRange.to);
      }
      if (typeFilter !== "all") {
        params.set("type", typeFilter);
      }
      if (walletFilter) {
        params.set("walletId", walletFilter);
      }
      if (categoryFilter && typeFilter !== "transfer") {
        params.set("categoryId", categoryFilter);
      }
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const res = await fetch(`/api/transactions?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || seq !== txRequestSeqRef.current) {
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal memuat riwayat transaksi.");
      }

      setItems(Array.isArray(data.items) ? (data.items as TransactionView[]) : []);
      setVisibleCount(40);
      if (data.summary) {
        setSummary(data.summary as TransactionsSummary);
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        seq !== txRequestSeqRef.current
      ) {
        return;
      }
      const msg =
        err instanceof Error ? err.message : "Gagal memuat riwayat transaksi.";
      setTxError(msg);
      toast.error(msg);
    } finally {
      if (!controller.signal.aborted && seq === txRequestSeqRef.current) {
        setLoadingTx(false);
      }
    }
  }, [
    activeRange.from,
    activeRange.to,
    dateRangeInvalid,
    typeFilter,
    walletFilter,
    categoryFilter,
    debouncedSearch,
  ]);

  const hasLeftInitialTxRef = useRef(false);

  useEffect(() => {
    const isInitialQuery =
      hasInitialTx &&
      !hasLeftInitialTxRef.current &&
      refreshTrigger === 0 &&
      periodPreset === "this_month" &&
      typeFilter === "all" &&
      walletFilter === "" &&
      categoryFilter === "" &&
      debouncedSearch === "";

    if (isInitialQuery) {
      return;
    }
    hasLeftInitialTxRef.current = true;

    void loadTransactions();
    return () => {
      txAbortRef.current?.abort();
    };
  }, [
    loadTransactions,
    refreshTrigger,
    hasInitialTx,
    periodPreset,
    typeFilter,
    walletFilter,
    categoryFilter,
    debouncedSearch,
  ]);

  // Fetch recurring rules
  const loadRecurring = useCallback(async () => {
    setLoadingRules(true);
    setRulesError(null);
    try {
      const res = await fetch("/api/recurring", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal memuat jadwal transaksi rutin.");
      }
      setRules(
        Array.isArray(data.rules) ? (data.rules as RecurringRuleView[]) : []
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memuat jadwal transaksi rutin.";
      setRulesError(msg);
      toast.error(msg);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialRules && refreshTrigger === 0) {
      return;
    }
    void loadRecurring();
  }, [loadRecurring, refreshTrigger, hasInitialRules]);

  // Owner wallets & categories for "+ Tambah Jadwal Rutin" modal
  const ownerWallets = useMemo(
    () => wallets.filter((w) => w.role === "owner"),
    [wallets]
  );

  const recurringCategories = useMemo(
    () => ownCategories.filter((c) => c.type === recType),
    [ownCategories, recType]
  );

  useEffect(() => {
    if (!createModalOpen) {
      return;
    }
    if (!recWalletId || !ownerWallets.some((w) => w.id === recWalletId)) {
      setRecWalletId(ownerWallets[0]?.id ?? "");
    }
  }, [createModalOpen, ownerWallets, recWalletId]);

  useEffect(() => {
    if (!createModalOpen) {
      return;
    }
    if (
      !recCategoryId ||
      !recurringCategories.some((c) => c.id === recCategoryId)
    ) {
      setRecCategoryId(recurringCategories[0]?.id ?? "");
    }
  }, [createModalOpen, recurringCategories, recCategoryId]);

  function openCreateRuleModal() {
    setCreateRuleError(null);
    setRecType("expense");
    setRecTitle("");
    setRecAmountDigits("");
    setRecWalletId(ownerWallets[0]?.id ?? "");
    const defaultCat = ownCategories.find((c) => c.type === "expense");
    setRecCategoryId(defaultCat?.id ?? "");
    setRecFrequency("monthly");
    setRecNextRunDate(getTodayISO());
    setCreateModalOpen(true);
  }

  async function handleCreateRule(event: React.FormEvent) {
    event.preventDefault();
    setCreateRuleError(null);

    const parsedAmount = Number(recAmountDigits);
    if (
      !recAmountDigits ||
      !Number.isSafeInteger(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setCreateRuleError("Nominal harus berupa bilangan bulat lebih dari Rp 0.");
      return;
    }

    const trimmedTitle = recTitle.trim();
    if (!trimmedTitle) {
      setCreateRuleError("Judul jadwal rutin wajib diisi.");
      return;
    }

    if (!recWalletId) {
      setCreateRuleError("Dompet wajib dipilih.");
      return;
    }

    if (!recCategoryId) {
      setCreateRuleError("Kategori wajib dipilih.");
      return;
    }

    if (!recNextRunDate) {
      setCreateRuleError("Tanggal jatuh tempo berikutnya wajib diisi.");
      return;
    }

    setCreatingRule(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: recWalletId,
          categoryId: recCategoryId,
          type: recType,
          amount: parsedAmount,
          title: trimmedTitle,
          frequency: recFrequency,
          nextRunDate: recNextRunDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal membuat jadwal rutin.";
        setCreateRuleError(msg);
        toast.error(msg);
        return;
      }

      toast.success("Jadwal transaksi rutin berhasil ditambahkan.");
      setCreateModalOpen(false);
      triggerRefresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat menyimpan jadwal rutin.";
      setCreateRuleError(msg);
      toast.error(msg);
    } finally {
      setCreatingRule(false);
    }
  }

  async function handleApplyRule(ruleId: string) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mencatat transaksi rutin.");
        return;
      }

      toast.success("Transaksi rutin berhasil dicatat ke buku kas.");
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

  async function handleSkipRule(ruleId: string) {
    setBusyRuleId(ruleId);
    try {
      const res = await fetch(
        `/api/recurring/${encodeURIComponent(ruleId)}/skip`,
        {
          method: "POST",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal melewati siklus jadwal rutin.");
        return;
      }

      toast.success("Siklus jadwal rutin berhasil dilewati.");
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat melewati jadwal rutin.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function handleDeleteRule(ruleId: string) {
    setBusyRuleId(ruleId);
    try {
      const res = await fetch(`/api/recurring/${encodeURIComponent(ruleId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menghapus jadwal rutin.");
        return;
      }

      toast.success("Jadwal transaksi rutin berhasil dihapus.");
      setConfirmDeleteRuleId(null);
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat menghapus jadwal rutin.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function handleToggleParticipantPaid(
    billId: string,
    participantId: string,
    nextPaid: boolean
  ) {
    setBusySplitId(`${billId}:${participantId}`);
    try {
      const res = await fetch(`/api/split-bills/${encodeURIComponent(billId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, isPaid: nextPaid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal memperbarui status peserta.");
        return;
      }
      const updated = data.splitBill as SplitBillView;
      setSplitBills((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b))
      );
      toast.success(
        nextPaid ? "Peserta ditandai sudah lunas." : "Status lunas dibatalkan."
      );
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setBusySplitId(null);
    }
  }

  async function handleDeleteSplitBill(billId: string) {
    setBusySplitId(billId);
    try {
      const res = await fetch(`/api/split-bills/${encodeURIComponent(billId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Gagal menghapus patungan.");
        return;
      }
      setSplitBills((prev) => prev.filter((b) => b.id !== billId));
      toast.success("Patungan berhasil dihapus.");
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setBusySplitId(null);
    }
  }

  async function handleCopySplitLink(slug: string) {
    const url = `${window.location.origin}/patungan/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSplitSlug(slug);
      toast.success("Link patungan berhasil disalin.");
      setTimeout(() => setCopiedSplitSlug(null), 2000);
    } catch {
      toast.error("Gagal menyalin link.");
    }
  }

  function resetFilters() {
    setPeriodPreset("this_month");
    setCustomFrom(defaultRange.from);
    setCustomTo(defaultRange.to);
    setTypeFilter("all");
    setWalletFilter("");
    setCategoryFilter("");
    setSearchInput("");
    setDebouncedSearch("");
  }

  const hasCustomFilter =
    periodPreset !== "this_month" ||
    typeFilter !== "all" ||
    walletFilter !== "" ||
    categoryFilter !== "" ||
    searchInput.trim() !== "";

  const dueRulesCount = rules.filter((r) => r.isDue).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Buku Transaksi
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#78716C]">
            Telusuri seluruh catatan pemasukan, pengeluaran, transfer, dan
            jadwal tagihan rutin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === "recurring" ? (
            <Button variant="primary" size="md" onClick={openCreateRuleModal}>
              <Plus className="h-4 w-4" />
              <span>Tambah Jadwal Rutin</span>
            </Button>
          ) : tab === "patungan" ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setSplitBillModalOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              <span>Buat Patungan Baru</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={() => openQuickAdd("expense")}
            >
              <Plus className="h-4 w-4" />
              <span>Catat Kas</span>
            </Button>
          )}
        </div>
      </div>

      {/* Top Tabs */}
      <div
        role="tablist"
        aria-label="Tampilan Buku Transaksi"
        className="inline-flex flex-wrap rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
            tab === "history"
              ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
              : "text-[#57534E] hover:text-[#1C1917]"
          )}
        >
          <ReceiptText className="h-4 w-4" />
          <span>Riwayat Transaksi</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "recurring"}
          onClick={() => setTab("recurring")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
            tab === "recurring"
              ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
              : "text-[#57534E] hover:text-[#1C1917]"
          )}
        >
          <CalendarClock className="h-4 w-4" />
          <span>Transaksi Berulang</span>
          {dueRulesCount > 0 && (
            <Badge variant="warning">
              <span className="tnum">{dueRulesCount}</span>
            </Badge>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "patungan"}
          onClick={() => setTab("patungan")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
            tab === "patungan"
              ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
              : "text-[#57534E] hover:text-[#1C1917]"
          )}
        >
          <Users className="h-4 w-4" />
          <span>Patungan</span>
          {splitBills.length > 0 && (
            <Badge variant="forest">
              <span className="tnum">{splitBills.length}</span>
            </Badge>
          )}
        </button>
      </div>

      {tab === "patungan" ? (
        <div className="space-y-4">
          {splitBills.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="Belum ada patungan (Split Bill)"
                description="Buat rincian patungan makan bersama, kado, atau liburan lalu bagikan link publiknya ke WhatsApp. Anda juga bisa klik transaksi pengeluaran mana pun lalu pilih 'Patungan'."
                action={
                  <Button
                    variant="primary"
                    onClick={() => setSplitBillModalOpen(true)}
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Buat Patungan Pertama</span>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {splitBills.map((bill) => {
                const pct =
                  bill.totalAmount > 0
                    ? Math.min(
                        100,
                        Math.round((bill.paidAmount / bill.totalAmount) * 100)
                      )
                    : 0;
                return (
                  <Card key={bill.id} padding="md" className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-[#1C1917]">
                            {bill.title}
                          </h3>
                          <Badge
                            variant={
                              bill.paidCount === bill.totalCount
                                ? "inflow"
                                : "warning"
                            }
                          >
                            {bill.paidCount}/{bill.totalCount} Lunas
                          </Badge>
                        </div>
                        <p className="tnum mt-0.5 text-xs text-[#78716C]">
                          {formatDateID(bill.occurredAt)} · Total{" "}
                          <strong className="text-[#1C1917]">
                            {formatIDR(bill.totalAmount)}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleCopySplitLink(bill.slug)}
                        >
                          {copiedSplitSlug === bill.slug ? (
                            <Check className="h-3.5 w-3.5 text-[#15803D]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>Link</span>
                        </Button>
                        <a
                          href={`/patungan/${bill.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E] hover:bg-[#FAF1E0] hover:text-[#14532D]"
                          title="Buka halaman publik"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          disabled={busySplitId === bill.id}
                          onClick={() => void handleDeleteSplitBill(bill.id)}
                          aria-label={`Hapus patungan ${bill.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#B91C1C] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                        <div
                          className="h-full rounded-full bg-[#15803D]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#78716C]">
                        <span>Terkumpul {formatIDR(bill.paidAmount)}</span>
                        <span>Sisa {formatIDR(bill.unpaidAmount)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {bill.participants.map((p) => {
                        const isBusy =
                          busySplitId === `${bill.id}:${p.id}`;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] px-3 py-2 text-xs"
                          >
                            <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={p.isPaid}
                                disabled={isBusy}
                                onChange={(e) =>
                                  void handleToggleParticipantPaid(
                                    bill.id,
                                    p.id,
                                    e.target.checked
                                  )
                                }
                                className="h-3.5 w-3.5 accent-[#14532D]"
                              />
                              <span
                                className={cn(
                                  "truncate font-medium",
                                  p.isPaid
                                    ? "line-through text-[#78716C]"
                                    : "text-[#1C1917]"
                                )}
                              >
                                {p.name}
                              </span>
                            </label>
                            <span className="tnum font-semibold text-[#1C1917] shrink-0">
                              {formatIDR(p.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : tab === "history" ? (
        <div className="space-y-5">
          {/* Filter Bar */}
          <Card padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "this_month", label: "Bulan Ini" },
                    { id: "last_month", label: "Bulan Lalu" },
                    { id: "three_months", label: "3 Bulan" },
                    { id: "this_year", label: "Tahun Ini" },
                    { id: "custom", label: "Kustom" },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPeriodPreset(preset.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                      periodPreset === preset.id
                        ? "border-[#14532D] bg-[#14532D] text-[#FFFFFF]"
                        : "border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E] hover:bg-[#EFECE4]"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {hasCustomFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Atur Ulang Filter</span>
                </button>
              )}
            </div>

            {periodPreset === "custom" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
                <Input
                  label="Dari Tanggal"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="tnum"
                />
                <Input
                  label="Sampai Tanggal"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="tnum"
                />
              </div>
            )}

            {dateRangeInvalid && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2 text-xs text-[#B91C1C]"
              >
                Tanggal awal tidak boleh melebihi tanggal akhir.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="Tipe"
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as TransactionType | "all")
                }
              >
                <option value="all">Semua Tipe</option>
                <option value="income">Uang Masuk</option>
                <option value="expense">Uang Keluar</option>
                <option value="transfer">Transfer</option>
              </Select>

              <Select
                label="Dompet"
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
              >
                <option value="">Semua Dompet</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.role === "viewer"
                      ? " (Pantau)"
                      : w.isShared
                        ? " (Bersama)"
                        : ""}
                  </option>
                ))}
              </Select>

              <Select
                label="Kategori"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                disabled={typeFilter === "transfer"}
              >
                <option value="">
                  {typeFilter === "transfer"
                    ? "Tidak berlaku untuk transfer"
                    : "Semua Kategori"}
                </option>
                {visibleFilterCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>

              <div className="space-y-1.5">
                <label
                  htmlFor="tx-search-input"
                  className="block text-xs font-medium text-[#57534E]"
                >
                  Pencarian
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
                  <input
                    id="tx-search-input"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Cari judul atau catatan..."
                    className="w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-9 pr-3.5 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Dynamic Totals Strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card padding="sm">
              <p className="text-xs text-[#78716C]">Total Masuk</p>
              <p className="tnum font-display mt-1 text-lg sm:text-xl font-medium text-[#15803D]">
                {formatIDR(summary.income)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-[#78716C]">Total Keluar</p>
              <p className="tnum font-display mt-1 text-lg sm:text-xl font-medium text-[#B91C1C]">
                {formatIDR(summary.expense)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-[#78716C]">Selisih Bersih</p>
              <p
                className={cn(
                  "tnum font-display mt-1 text-lg sm:text-xl font-medium",
                  summary.net >= 0 ? "text-[#15803D]" : "text-[#B91C1C]"
                )}
              >
                {formatIDR(summary.net, { signed: true })}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-[#78716C]">Jumlah Transaksi</p>
              <p className="tnum font-display mt-1 text-lg sm:text-xl font-medium text-[#1C1917]">
                {summary.count} transaksi
              </p>
            </Card>
          </div>

          {/* Ledger Table */}
          {loadingTx ? (
            <SkeletonCard lines={6} />
          ) : txError ? (
            <Card padding="lg">
              <EmptyState
                title="Gagal memuat transaksi"
                description={txError}
                action={
                  <Button
                    variant="primary"
                    onClick={() => void loadTransactions()}
                  >
                    Coba Lagi
                  </Button>
                }
              />
            </Card>
          ) : items.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={<ReceiptText className="h-5 w-5" />}
                title="Tidak ada transaksi pada filter ini"
                description="Ubah rentang tanggal atau kata kunci pencarian, atau catat transaksi baru."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {hasCustomFilter && (
                      <Button variant="secondary" onClick={resetFilters}>
                        Atur Ulang Filter
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      onClick={() => openQuickAdd("expense")}
                    >
                      <Plus className="h-4 w-4" />
                      <span>Catat Kas</span>
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              {/* Grouped by Date — Desktop & Mobile */}
              <div className="divide-y divide-[#E3D4BA]">
                {groupedByDate.map((group) => (
                  <div key={group.date}>
                    {/* Daily Date Group Header */}
                    <div className="flex items-center justify-between gap-2 bg-[#FAF0DD]/80 px-4 py-2 text-xs border-b border-[#E3D4BA]/70">
                      <span className="font-semibold text-[#1C1917]">
                        {group.label}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-[#78716C]">
                        <span className="tnum">
                          {group.rows.length} transaksi
                        </span>
                        {group.dailyNet !== 0 && (
                          <>
                            <span>·</span>
                            <span
                              className={cn(
                                "tnum font-semibold",
                                group.dailyNet > 0
                                  ? "text-[#15803D]"
                                  : "text-[#B91C1C]"
                              )}
                            >
                              {formatIDR(group.dailyNet, { signed: true })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Desktop Crisp Table Rows for this Date */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-[#E7E2D8] text-sm">
                          {group.rows.map((tx) => {
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
                              <tr
                                key={tx.id}
                                onClick={() => {
                                  setSelectedTx(tx);
                                  setDrawerOpen(true);
                                }}
                                className="transition-colors hover:bg-[#FAF0DD]/45 cursor-pointer"
                              >
                                <td className="py-3.5 pl-5 pr-3 w-[34%] max-w-[280px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-medium text-[#1C1917]">
                                      {tx.title}
                                    </span>
                                    {tx.hasAttachment && (
                                      <Paperclip
                                        aria-label="Ada lampiran nota"
                                        className="h-3.5 w-3.5 shrink-0 text-[#78716C]"
                                      />
                                    )}
                                  </div>
                                  {tx.notes && (
                                    <p className="truncate text-xs text-[#78716C] mt-0.5">
                                      {tx.notes}
                                    </p>
                                  )}
                                </td>

                                <td className="py-3.5 px-3 whitespace-nowrap w-[20%]">
                                  {isTransfer ? (
                                    <Badge variant="neutral">
                                      <ArrowLeftRight className="h-3 w-3" />
                                      <span>Transfer</span>
                                    </Badge>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E3D4BA] bg-[#FAF0DD]/50 px-2.5 py-0.5 text-xs font-medium text-[#57534E]">
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{
                                          backgroundColor:
                                            tx.categoryColor ?? "#78716C",
                                        }}
                                      />
                                      <span>
                                        {tx.categoryName ?? "Tanpa Kategori"}
                                      </span>
                                    </span>
                                  )}
                                </td>

                                <td className="py-3.5 px-3 text-xs text-[#57534E] w-[22%] max-w-[200px]">
                                  <span className="block truncate">
                                    {isTransfer
                                      ? `${tx.walletName} → ${tx.targetWalletName ?? tx.counterpartyWalletName ?? "-"}`
                                      : tx.walletName}
                                  </span>
                                </td>

                                <td className="py-3.5 px-3 whitespace-nowrap text-xs text-[#78716C] w-[10%]">
                                  {tx.recorderName}
                                </td>

                                <td
                                  className={cn(
                                    "tnum whitespace-nowrap py-3.5 pl-3 pr-5 text-right font-semibold w-[14%]",
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

                    {/* Mobile Card Rows for this Date */}
                    <div className="divide-y divide-[#E7E2D8] md:hidden">
                      {group.rows.map((tx) => {
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
                            className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-[#FAF0DD]/45 cursor-pointer"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-[#1C1917]">
                                  {tx.title}
                                </span>
                                {tx.hasAttachment && (
                                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#78716C]" />
                                )}
                              </div>
                              {tx.notes && (
                                <p className="truncate text-xs text-[#78716C]">
                                  {tx.notes}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#78716C]">
                                <span>
                                  {isTransfer
                                    ? `${tx.walletName} → ${tx.targetWalletName ?? tx.counterpartyWalletName ?? "-"}`
                                    : tx.walletName}
                                </span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                  {!isTransfer && (
                                    <span
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{
                                        backgroundColor:
                                          tx.categoryColor ?? "#78716C",
                                      }}
                                    />
                                  )}
                                  <span>
                                    {isTransfer
                                      ? "Transfer"
                                      : (tx.categoryName ?? "Tanpa Kategori")}
                                  </span>
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <p
                                className={cn(
                                  "tnum text-sm font-semibold",
                                  amountClass
                                )}
                              >
                                {amountStr}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#78716C]">
                                {tx.recorderName}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Footer ("Tampilkan Lebih Banyak") */}
              {items.length > visibleCount && (
                <div className="flex flex-col items-center justify-between gap-2 border-t border-[#E3D4BA] bg-[#FAF0DD]/45 px-4 py-3.5 sm:flex-row">
                  <p className="tnum text-xs text-[#57534E]">
                    Menampilkan <strong>{visibleItems.length}</strong> dari{" "}
                    <strong>{items.length}</strong> transaksi
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setVisibleCount((prev) => prev + 40)}
                  >
                    Tampilkan Lebih Banyak (+40)
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      ) : (
        /* Tab 2: Transaksi Berulang */
        <div className="space-y-4">
          {loadingRules ? (
            <SkeletonCard lines={4} />
          ) : rulesError ? (
            <Card padding="lg">
              <EmptyState
                title="Gagal memuat jadwal rutin"
                description={rulesError}
                action={
                  <Button variant="primary" onClick={() => void loadRecurring()}>
                    Coba Lagi
                  </Button>
                }
              />
            </Card>
          ) : rules.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="Belum ada transaksi berulang"
                description="Jadwalkan tagihan listrik, internet, cicilan, atau gaji bulanan agar pengingat muncul otomatis saat jatuh tempo."
                action={
                  <Button variant="primary" onClick={openCreateRuleModal}>
                    <Plus className="h-4 w-4" />
                    <span>Tambah Jadwal Rutin</span>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const isBusy = busyRuleId === rule.id;
                const isConfirmingDelete = confirmDeleteRuleId === rule.id;
                const isIncome = rule.type === "income";

                return (
                  <Card
                    key={rule.id}
                    padding="md"
                    className={cn(
                      rule.isDue && "border-[#FDE68A] bg-[#FEF3C7]/20"
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                              isIncome
                                ? "bg-[#DCFCE7] text-[#15803D]"
                                : "bg-[#FEE2E2] text-[#B91C1C]"
                            )}
                          >
                            {isIncome ? (
                              <ArrowDownLeft className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <h3 className="text-base font-semibold text-[#1C1917]">
                            {rule.title}
                          </h3>
                          <Badge variant="neutral">
                            {rule.frequency === "weekly"
                              ? "Mingguan"
                              : "Bulanan"}
                          </Badge>
                          {rule.isDue ? (
                            <Badge variant="warning">Jatuh Tempo</Badge>
                          ) : rule.isActive ? (
                            <Badge variant="forest">Terjadwal</Badge>
                          ) : (
                            <Badge variant="neutral">Nonaktif</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
                          <span>{rule.walletName}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: rule.categoryColor }}
                            />
                            {rule.categoryName}
                          </span>
                          <span>·</span>
                          <span>
                            Berikutnya:{" "}
                            <strong className="tnum font-semibold text-[#1C1917]">
                              {formatDateID(rule.nextRunDate)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
                        <div className="sm:text-right">
                          <p className="text-[11px] text-[#78716C]">
                            Nominal Tetap
                          </p>
                          <p
                            className={cn(
                              "tnum font-display text-xl font-medium",
                              isIncome ? "text-[#15803D]" : "text-[#B91C1C]"
                            )}
                          >
                            {formatIDR(rule.amount)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative w-40">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#78716C]">
                              Rp
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Nominal ubahan untuk ${rule.title}`}
                              placeholder={formatDigitsIDR(String(rule.amount))}
                              value={formatDigitsIDR(
                                overrideDigits[rule.id] ?? ""
                              )}
                              disabled={isBusy || !rule.isActive}
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
                              className="tnum h-8 w-full rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] pl-8 pr-2.5 text-xs text-[#1C1917] placeholder:text-[#78716C]/70 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                            />
                          </div>

                          <Button
                            size="sm"
                            variant="primary"
                            loading={isBusy}
                            disabled={!rule.isActive}
                            onClick={() => void handleApplyRule(rule.id)}
                          >
                            Catat Sekarang
                          </Button>

                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isBusy || !rule.isActive}
                            onClick={() => void handleSkipRule(rule.id)}
                          >
                            <SkipForward className="h-3.5 w-3.5" />
                            <span>Lewati Siklus</span>
                          </Button>

                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="danger"
                                loading={isBusy}
                                onClick={() => void handleDeleteRule(rule.id)}
                              >
                                Ya, Hapus
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteRuleId(null)}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteRuleId(rule.id)}
                              aria-label={`Hapus jadwal ${rule.title}`}
                              className="text-[#B91C1C] hover:bg-[#FEE2E2]/50 hover:text-[#B91C1C]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Hapus</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Receipt Detail Drawer */}
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

      {/* Create Split Bill Modal */}
      <SplitBillModal
        open={splitBillModalOpen}
        onClose={() => setSplitBillModalOpen(false)}
        onCreated={(created) => {
          setSplitBills((prev) => [created, ...prev]);
        }}
      />

      {/* Create Recurring Rule Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Tambah Jadwal Rutin"
        description="Buat pengingat pemasukan atau tagihan mingguan dan bulanan."
        size="md"
      >
        <form onSubmit={handleCreateRule} noValidate className="space-y-4">
          {createRuleError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {createRuleError}
            </div>
          )}

          {ownerWallets.length === 0 && (
            <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 px-3.5 py-2.5 text-xs text-[#92400E]">
              Jadwal rutin hanya dapat dibuat pada dompet yang Anda miliki
              sendiri.
            </div>
          )}

          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 p-1">
            {(
              [
                { value: "expense", label: "Pengeluaran", color: "text-[#B91C1C]" },
                { value: "income", label: "Pemasukan", color: "text-[#15803D]" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRecType(opt.value)}
                className={cn(
                  "rounded-lg py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
                  recType === opt.value
                    ? `bg-[#FFFFFF] font-semibold shadow-2xs ${opt.color}`
                    : "text-[#57534E] hover:text-[#1C1917]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Input
            label="Judul Jadwal"
            required
            maxLength={120}
            value={recTitle}
            onChange={(e) => setRecTitle(e.target.value)}
            placeholder="Contoh: Tagihan Internet, Gaji Bulanan, Iuran RT"
          />

          <div className="space-y-1.5">
            <label
              htmlFor="rec-amount-input"
              className="block text-xs font-medium text-[#57534E]"
            >
              Nominal <span className="text-[#B91C1C]">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-3.5 font-display text-lg text-[#78716C]">
                Rp
              </span>
              <input
                id="rec-amount-input"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatDigitsIDR(recAmountDigits)}
                onChange={(e) => {
                  const digits = e.target.value
                    .replace(/\D/g, "")
                    .replace(/^0+/, "");
                  if (digits.length <= 15) {
                    setRecAmountDigits(digits);
                  }
                }}
                className="tnum font-display w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-11 pr-4 text-2xl font-medium text-[#1C1917] placeholder:text-[#78716C]/50 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Dompet (Milik Sendiri)"
              required
              value={recWalletId}
              onChange={(e) => setRecWalletId(e.target.value)}
              disabled={ownerWallets.length === 0}
            >
              {ownerWallets.length === 0 ? (
                <option value="">Tidak ada dompet milik sendiri</option>
              ) : (
                ownerWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatIDR(w.balance)})
                  </option>
                ))
              )}
            </Select>

            <Select
              label="Kategori"
              required
              value={recCategoryId}
              onChange={(e) => setRecCategoryId(e.target.value)}
            >
              {recurringCategories.length === 0 ? (
                <option value="">Tidak ada kategori</option>
              ) : (
                recurringCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Frekuensi"
              required
              value={recFrequency}
              onChange={(e) =>
                setRecFrequency(e.target.value as RecurringFrequency)
              }
            >
              <option value="monthly">Bulanan</option>
              <option value="weekly">Mingguan</option>
            </Select>

            <Input
              label="Jatuh Tempo Pertama"
              type="date"
              required
              value={recNextRunDate}
              onChange={(e) => setRecNextRunDate(e.target.value)}
              className="tnum"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E2D8]">
            <Button
              variant="secondary"
              onClick={() => setCreateModalOpen(false)}
              disabled={creatingRule}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={creatingRule}
              disabled={ownerWallets.length === 0}
            >
              Simpan Jadwal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
