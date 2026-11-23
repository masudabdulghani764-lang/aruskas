"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  FileText,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import { compressReceiptImageIfNeeded } from "@/lib/client-image";
import { formatIDR, getTodayISO } from "@/lib/format";
import { enqueueOfflineTransaction } from "@/lib/offline-queue";
import { parseSmartTransactionText } from "@/lib/smart-paste";

export type QuickAddType = "income" | "expense" | "transfer";

interface WalletOption {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  type: "cash" | "bank" | "ewallet" | "savings";
  balance: number;
  isShared: boolean;
  role: "owner" | "editor" | "viewer";
}

interface CategoryOption {
  id: string;
  userId: string;
  name: string;
  type: "income" | "expense";
  icon: string;
  color: string;
}

export interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: QuickAddType;
  defaultWalletId?: string;
  onSuccess?: () => void;
}

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const PAYMENT_METHODS = [
  "Transfer Bank",
  "QRIS",
  "Tunai",
  "Kartu Debit",
  "Kartu Kredit",
  "E-Wallet",
  "Auto-Debit",
] as const;

const TYPE_TABS: Array<{
  value: QuickAddType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
}> = [
  {
    value: "expense",
    label: "Uang Keluar",
    icon: ArrowUpRight,
    activeClass: "bg-[#FFFFFF] text-[#B91C1C] border-[#FECACA]",
  },
  {
    value: "income",
    label: "Uang Masuk",
    icon: ArrowDownLeft,
    activeClass: "bg-[#FFFFFF] text-[#15803D] border-[#BBF7D0]",
  },
  {
    value: "transfer",
    label: "Transfer",
    icon: ArrowLeftRight,
    activeClass: "bg-[#FFFFFF] text-[#1C1917] border-[#D6CFC2]",
  },
];

function formatDigitsIDR(digits: string): string {
  if (!digits) {
    return "";
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Global 3-tab quick transaction modal supporting Income, Expense, Transfer,
 * shared-wallet owner categories, and optional receipt attachment upload.
 */
export function QuickAddModal({
  open,
  onClose,
  defaultType = "expense",
  defaultWalletId,
  onSuccess,
}: QuickAddModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryCacheRef = useRef<Map<string, CategoryOption[]>>(new Map());
  const walletsReadyRef = useRef(false);

  const [txType, setTxType] = useState<QuickAddType>(defaultType);
  const [amountDigits, setAmountDigits] = useState("");
  const [title, setTitle] = useState("");
  const [walletId, setWalletId] = useState("");
  const [targetWalletId, setTargetWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => getTodayISO());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [smartInput, setSmartInput] = useState("");
  const [smartAppliedLabel, setSmartAppliedLabel] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(
    null
  );
  const [compressingImage, setCompressingImage] = useState(false);

  useEffect(() => {
    if (!attachment || !attachment.type.toLowerCase().startsWith("image/")) {
      setAttachmentPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [attachment]);

  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [categoriesByOwner, setCategoriesByOwner] = useState<
    Record<string, CategoryOption[]>
  >({});
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedWallet = useMemo(
    () => wallets.find((w) => w.id === walletId) ?? null,
    [wallets, walletId]
  );

  const availableCategories = useMemo(() => {
    if (!selectedWallet || txType === "transfer") {
      return [];
    }
    const ownerCats = categoriesByOwner[selectedWallet.ownerId] ?? [];
    return ownerCats.filter((c) => c.type === txType);
  }, [categoriesByOwner, selectedWallet, txType]);

  const targetWalletOptions = useMemo(
    () => wallets.filter((w) => w.id !== walletId),
    [wallets, walletId]
  );

  const loadCategoriesForOwner = useCallback(async (ownerId: string) => {
    const cached = categoryCacheRef.current.get(ownerId);
    if (cached) {
      setCategoriesByOwner((prev) =>
        prev[ownerId] ? prev : { ...prev, [ownerId]: cached }
      );
      return;
    }

    setLoadingCategories(true);
    try {
      const res = await fetch(
        `/api/categories?ownerId=${encodeURIComponent(ownerId)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal memuat kategori.");
      }
      const list = Array.isArray(data.categories)
        ? (data.categories as CategoryOption[])
        : [];
      categoryCacheRef.current.set(ownerId, list);
      setCategoriesByOwner((prev) => ({ ...prev, [ownerId]: list }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memuat daftar kategori.";
      setErrorMsg(message);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  // Reset form state and fetch active writable wallets whenever modal opens.
  useEffect(() => {
    if (!open) {
      walletsReadyRef.current = false;
      setWallets([]);
      setWalletId("");
      setTargetWalletId("");
      setCategoryId("");
      setLoadingWallets(false);
      return;
    }

    walletsReadyRef.current = false;
    categoryCacheRef.current.clear();
    setCategoriesByOwner({});
    setWallets([]);
    setWalletId("");
    setTargetWalletId("");
    setCategoryId("");
    setTxType(defaultType);
    setAmountDigits("");
    setTitle("");
    setOccurredAt(getTodayISO());
    setPaymentMethod("");
    setNotes("");
    setSmartInput("");
    setSmartAppliedLabel(null);
    setAttachment(null);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    let cancelled = false;
    setLoadingWallets(true);

    fetch("/api/wallets", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Gagal memuat daftar dompet.");
        }
        return (data.wallets ?? []) as WalletOption[];
      })
      .then((allWallets) => {
        if (cancelled) {
          return;
        }
        const writable = allWallets.filter(
          (w) => w.role === "owner" || w.role === "editor"
        );
        setWallets(writable);

        const preferred =
          defaultWalletId && writable.some((w) => w.id === defaultWalletId)
            ? defaultWalletId
            : (writable[0]?.id ?? "");

        setWalletId(preferred);
        const firstOther = writable.find((w) => w.id !== preferred)?.id ?? "";
        setTargetWalletId(firstOther);
        walletsReadyRef.current = true;
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error ? err.message : "Gagal memuat daftar dompet."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWallets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, defaultType, defaultWalletId]);

  // Fetch owner categories when source wallet changes (critical for shared wallets).
  useEffect(() => {
    if (!open || loadingWallets || !walletsReadyRef.current || !selectedWallet) {
      return;
    }
    void loadCategoriesForOwner(selectedWallet.ownerId);
  }, [open, loadingWallets, selectedWallet, loadCategoriesForOwner]);

  // Keep category selection synchronized with current wallet owner and transaction type.
  useEffect(() => {
    if (txType === "transfer") {
      return;
    }
    if (availableCategories.length === 0) {
      setCategoryId("");
      return;
    }
    if (!availableCategories.some((c) => c.id === categoryId)) {
      setCategoryId(availableCategories[0].id);
    }
  }, [availableCategories, categoryId, txType]);

  // Ensure transfer target wallet is never equal to source wallet.
  useEffect(() => {
    if (txType !== "transfer") {
      return;
    }
    if (targetWalletOptions.length === 0) {
      setTargetWalletId("");
      return;
    }
    if (!targetWalletOptions.some((w) => w.id === targetWalletId)) {
      setTargetWalletId(targetWalletOptions[0].id);
    }
  }, [txType, targetWalletOptions, targetWalletId]);

  function handleAmountChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = event.target.value.replace(/\D/g, "").replace(/^0+/, "");
    if (digitsOnly.length > 15) {
      return;
    }
    setAmountDigits(digitsOnly);
    if (errorMsg) {
      setErrorMsg(null);
    }
  }

  function addQuickAmount(delta: number) {
    const current = Number(amountDigits || "0");
    const next = Math.min(Number.MAX_SAFE_INTEGER, current + delta);
    setAmountDigits(String(next));
    if (errorMsg) {
      setErrorMsg(null);
    }
  }

  function applySmartPaste(overrideText?: string) {
    const text = (overrideText ?? smartInput).trim();
    if (!text) {
      return;
    }
    const ownerCats = selectedWallet
      ? (categoriesByOwner[selectedWallet.ownerId] ?? [])
      : [];
    const parsed = parseSmartTransactionText(text, ownerCats);
    if (!parsed) {
      toast.error(
        'Belum menemukan nominal. Contoh: "Makan siang Padang 38rb pakai QRIS"'
      );
      return;
    }

    setTxType(parsed.type);
    setAmountDigits(String(parsed.amount));
    setTitle(parsed.title);
    setOccurredAt(parsed.occurredAt);
    if (parsed.paymentMethod) {
      setPaymentMethod(parsed.paymentMethod);
    }
    if (parsed.categoryId && parsed.type !== "transfer") {
      setCategoryId(parsed.categoryId);
    }
    if (parsed.notes) {
      setNotes(parsed.notes);
    }
    setErrorMsg(null);
    setSmartAppliedLabel(
      `${parsed.title} · ${formatIDR(parsed.amount)}${parsed.categoryName ? ` · ${parsed.categoryName}` : ""}`
    );
    toast.success("Form terisi otomatis dari Smart Paste!");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = event.target.files?.[0] ?? null;
    if (!rawFile) {
      setAttachment(null);
      return;
    }

    if (!ALLOWED_MIMES.has(rawFile.type.toLowerCase())) {
      setErrorMsg("Format lampiran harus JPG, PNG, WebP, atau PDF.");
      event.target.value = "";
      return;
    }

    setCompressingImage(true);
    try {
      const processed = await compressReceiptImageIfNeeded(rawFile);
      if (processed.size > MAX_ATTACHMENT_BYTES) {
        setErrorMsg("Ukuran lampiran maksimal 2 MB.");
        event.target.value = "";
        return;
      }
      setErrorMsg(null);
      setAttachment(processed);
    } finally {
      setCompressingImage(false);
    }
  }

  function clearAttachment() {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMsg(null);

    const parsedAmount = Number(amountDigits);
    if (!amountDigits || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Nominal harus berupa bilangan bulat lebih dari Rp 0.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg("Judul transaksi wajib diisi.");
      return;
    }

    if (!walletId) {
      setErrorMsg("Dompet asal wajib dipilih.");
      return;
    }

    if (txType === "transfer") {
      if (!targetWalletId) {
        setErrorMsg("Dompet tujuan wajib dipilih untuk transfer.");
        return;
      }
      if (targetWalletId === walletId) {
        setErrorMsg("Dompet tujuan harus berbeda dari dompet asal.");
        return;
      }
    } else if (!categoryId) {
      setErrorMsg("Kategori wajib dipilih.");
      return;
    }

    if (!occurredAt) {
      setErrorMsg("Tanggal transaksi wajib diisi.");
      return;
    }

    setSubmitting(true);
    const jsonPayload = {
      walletId,
      targetWalletId: txType === "transfer" ? targetWalletId : null,
      categoryId: txType === "transfer" ? null : categoryId,
      type: txType,
      amount: parsedAmount,
      title: trimmedTitle,
      paymentMethod: paymentMethod.trim() || null,
      notes: notes.trim() || null,
      occurredAt,
    };

    // Immediate offline queue fallback when offline (without binary attachment)
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (attachment) {
        setSubmitting(false);
        const offlineAttachMsg =
          "Lampiran foto/PDF membutuhkan koneksi internet. Hapus lampiran jika ingin simpan ke antrean offline.";
        setErrorMsg(offlineAttachMsg);
        toast.error(offlineAttachMsg);
        return;
      }
      enqueueOfflineTransaction(
        jsonPayload,
        selectedWallet?.name ?? "Dompet Pilihan"
      );
      toast.warning(
        "Sedang offline — transaksi disimpan di antrean dan akan otomatis dikirim saat internet aktif."
      );
      setSubmitting(false);
      onClose();
      return;
    }

    try {
      let res: Response;

      if (attachment) {
        const formData = new FormData();
        formData.append("walletId", walletId);
        formData.append("type", txType);
        formData.append("amount", String(parsedAmount));
        formData.append("title", trimmedTitle);
        formData.append("occurredAt", occurredAt);
        if (txType === "transfer") {
          formData.append("targetWalletId", targetWalletId);
        } else {
          formData.append("categoryId", categoryId);
        }
        if (paymentMethod.trim()) {
          formData.append("paymentMethod", paymentMethod.trim());
        }
        if (notes.trim()) {
          formData.append("notes", notes.trim());
        }
        formData.append("attachment", attachment);

        res = await fetch("/api/transactions", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jsonPayload),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal mencatat transaksi.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      const successLabel =
        txType === "income"
          ? "Pemasukan berhasil dicatat."
          : txType === "transfer"
            ? "Transfer antar dompet berhasil dicatat."
            : "Pengeluaran berhasil dicatat.";
      toast.success(successLabel);

      onSuccess?.();
      onClose();
      router.refresh();
    } catch {
      if (!attachment) {
        enqueueOfflineTransaction(
          jsonPayload,
          selectedWallet?.name ?? "Dompet Pilihan"
        );
        toast.warning(
          "Koneksi terputus — transaksi masuk antrean offline dan otomatis tersinkron saat terhubung kembali."
        );
        onClose();
      } else {
        const msg = "Terjadi gangguan jaringan saat mengunggah lampiran transaksi.";
        setErrorMsg(msg);
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const transferNeedsMoreWallets = txType === "transfer" && wallets.length < 2;
  const noWritableWallets = !loadingWallets && wallets.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Catat Arus Kas"
      description="Saldo dompet diperbarui langsung secara atomik."
      size="md"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* 3-Tab Switcher */}
        <div
          role="tablist"
          aria-label="Jenis transaksi"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 p-1"
        >
          {TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = txType === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTxType(tab.value);
                  setErrorMsg(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border border-transparent py-2 px-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
                  active
                    ? tab.activeClass
                    : "text-[#57534E] hover:text-[#1C1917]"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {noWritableWallets && (
          <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 px-4 py-3 text-xs sm:text-sm text-[#92400E]">
            Anda belum memiliki dompet dengan izin catat.{" "}
            <Link
              href="/dompet"
              onClick={onClose}
              className="font-semibold underline underline-offset-2 text-[#14532D]"
            >
              Buat dompet baru
            </Link>{" "}
            terlebih dahulu.
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
          >
            {errorMsg}
          </div>
        )}

        {/* Smart Paste — 1-Line Natural Language & Bank Notification Parser */}
        {!noWritableWallets && (
          <div className="rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1]/85 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="smart-paste-input"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#14532D]"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#B45309]" />
                <span>Smart Paste · Ketik Cepat 1 Baris</span>
              </label>
              {smartAppliedLabel && (
                <span className="truncate text-[11px] font-medium text-[#15803D]">
                  ✓ Terisi otomatis
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                id="smart-paste-input"
                type="text"
                value={smartInput}
                onChange={(e) => setSmartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applySmartPaste();
                  }
                }}
                placeholder='Misal: "Makan Padang 38rb QRIS" atau tempel notif bank'
                className="min-w-0 flex-1 rounded-xl border border-[#CBE0D2] bg-[#FFFFFF] px-3 py-2 text-xs text-[#1C1917] placeholder:text-[#78716C]/75 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => applySmartPaste()}
                disabled={!smartInput.trim()}
              >
                Isi
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                "Kopi Kenangan 35rb QRIS",
                "Bensin Pertamax 150rb tunai",
                "Gaji bulanan 8.5jt transfer",
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setSmartInput(example);
                    applySmartPaste(example);
                  }}
                  className="rounded-full border border-[#CBE0D2] bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-medium text-[#14532D] transition-colors hover:bg-[#DCFCE7] cursor-pointer"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hero Nominal Input + Quick Amount Chips */}
        <div className="rounded-2xl border border-[#E3D4BA] bg-gradient-to-br from-[#FAF0DD]/70 via-[#FFFBF2] to-[#FFFFFF] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="quick-add-amount"
              className="block text-xs font-semibold uppercase tracking-wider text-[#57534E]"
            >
              Nominal Transaksi <span className="text-[#B91C1C]">*</span>
            </label>
            {amountDigits && (
              <button
                type="button"
                onClick={() => setAmountDigits("")}
                className="text-[11px] font-medium text-[#78716C] hover:text-[#B91C1C] cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 font-display text-xl text-[#78716C]">
              Rp
            </span>
            <input
              id="quick-add-amount"
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="0"
              value={formatDigitsIDR(amountDigits)}
              onChange={handleAmountChange}
              disabled={noWritableWallets}
              className="tnum font-display w-full rounded-xl border border-[#E3D4BA] bg-[#FFFFFF] py-3 pl-12 pr-4 text-2xl sm:text-3xl font-semibold text-[#1C1917] placeholder:text-[#78716C]/45 transition-colors focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15 disabled:bg-[#EFECE4]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: "+25rb", value: 25_000 },
              { label: "+50rb", value: 50_000 },
              { label: "+100rb", value: 100_000 },
              { label: "+500rb", value: 500_000 },
              { label: "+1jt", value: 1_000_000 },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={noWritableWallets}
                onClick={() => addQuickAmount(chip.value)}
                className="tnum rounded-lg border border-[#E3D4BA] bg-[#FFFFFF] px-2.5 py-1 text-xs font-semibold text-[#14532D] transition-colors hover:border-[#14532D] hover:bg-[#DCFCE7]/40 cursor-pointer disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <Input
          label="Judul Transaksi"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={noWritableWallets}
          placeholder={
            txType === "income"
              ? "Contoh: Gaji bulanan, Bonus proyek"
              : txType === "transfer"
                ? "Contoh: Pindah ke tabungan, Tarik tunai"
                : "Contoh: Makan siang, Belanja dapur, Listrik"
          }
        />

        {/* Wallets & Category */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={txType === "transfer" ? "Dompet Asal" : "Dompet"}
            required
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            disabled={loadingWallets || noWritableWallets}
          >
            {loadingWallets ? (
              <option value="">Memuat dompet...</option>
            ) : wallets.length === 0 ? (
              <option value="">Tidak ada dompet</option>
            ) : (
              wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatIDR(w.balance)})
                  {w.isShared ? " · Bersama" : ""}
                </option>
              ))
            )}
          </Select>

          {txType === "transfer" ? (
            <Select
              label="Dompet Tujuan"
              required
              value={targetWalletId}
              onChange={(e) => setTargetWalletId(e.target.value)}
              disabled={loadingWallets || transferNeedsMoreWallets}
            >
              {targetWalletOptions.length === 0 ? (
                <option value="">Perlu minimal 2 dompet</option>
              ) : (
                targetWalletOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatIDR(w.balance)})
                    {w.isShared ? " · Bersama" : ""}
                  </option>
                ))
              )}
            </Select>
          ) : (
            <Select
              label="Kategori"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={loadingCategories || noWritableWallets}
              hint={
                selectedWallet && selectedWallet.role === "editor"
                  ? `Kategori milik ${selectedWallet.ownerName}`
                  : undefined
              }
            >
              {loadingCategories ? (
                <option value="">Memuat kategori...</option>
              ) : availableCategories.length === 0 ? (
                <option value="">Tidak ada kategori</option>
              ) : (
                availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))
              )}
            </Select>
          )}
        </div>

        {transferNeedsMoreWallets && (
          <p className="rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/60 px-3.5 py-2.5 text-xs text-[#57534E]">
            Anda memerlukan minimal 2 dompet dengan akses pemilik/editor untuk
            melakukan transfer antar dompet.
          </p>
        )}

        {/* Quick Category Chip Grid (1-Tap Mobile Selection) */}
        {txType !== "transfer" && availableCategories.length > 0 && (
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[#57534E]">
              Pilih Cepat Kategori
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {availableCategories.map((cat) => {
                const selected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                      selected
                        ? "border-[#14532D] bg-[#14532D] text-[#FFFFFF]"
                        : "border-[#E3D4BA] bg-[#FFFFFF] text-[#57534E] hover:bg-[#FAF0DD]"
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0 border border-white/40"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date & Payment Method */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Tanggal"
            type="date"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            disabled={noWritableWallets}
            className="tnum"
          />

          <Select
            label="Metode Pembayaran"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            disabled={noWritableWallets}
          >
            <option value="">Opsional</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </div>

        {/* 1-Tap Payment Method Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {["QRIS", "Transfer Bank", "Tunai", "E-Wallet", "Kartu Debit"].map(
            (method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  disabled={noWritableWallets}
                  onClick={() =>
                    setPaymentMethod((prev) => (prev === method ? "" : method))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                    active
                      ? "border-[#14532D] bg-[#DCFCE7] text-[#14532D] font-semibold"
                      : "border-[#E3D4BA] bg-[#FAF0DD]/60 text-[#57534E] hover:bg-[#FAF0DD]"
                  )}
                >
                  {method}
                </button>
              );
            }
          )}
        </div>

        {/* Notes */}
        <Textarea
          label="Catatan (Opsional)"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={noWritableWallets}
          placeholder="Tambahkan keterangan atau nomor referensi bila perlu..."
        />

        {/* Optional Receipt Attachment with Auto-Compression & Thumbnail Preview */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[#57534E]">
            Bukti Nota (Opsional · Foto Kamera HP Otomatis Dikompresi / PDF maks. 2 MB)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => void handleFileChange(e)}
            disabled={noWritableWallets || compressingImage}
            className="sr-only"
            id="quick-add-attachment"
          />

          {attachment ? (
            <div className="space-y-2 rounded-xl border border-[#E3D4BA] bg-[#FAF0DD]/50 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-[#1C1917]">
                  <FileText className="h-4 w-4 shrink-0 text-[#14532D]" />
                  <span className="truncate font-medium">{attachment.name}</span>
                  <span className="shrink-0 text-[#78716C] tnum">
                    ({formatFileSize(attachment.size)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Hapus lampiran"
                  className="rounded-md p-1 text-[#78716C] hover:bg-[#EFECE4] hover:text-[#B91C1C] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {attachmentPreviewUrl && (
                <div className="overflow-hidden rounded-lg border border-[#E3D4BA] bg-[#FFFFFF]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachmentPreviewUrl}
                    alt="Pratinjau struk"
                    className="max-h-40 w-full object-contain"
                  />
                </div>
              )}
            </div>
          ) : (
            <label
              htmlFor="quick-add-attachment"
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#E3D4BA] bg-[#FAF0DD]/45 px-3.5 py-2.5 text-xs font-medium text-[#57534E] transition-colors hover:border-[#14532D]/40 hover:bg-[#EFECE4]/60 cursor-pointer",
                (noWritableWallets || compressingImage) &&
                  "pointer-events-none opacity-55"
              )}
            >
              <Paperclip className="h-3.5 w-3.5 text-[#78716C]" />
              <span>
                {compressingImage
                  ? "Mengoptimalkan ukuran foto struk..."
                  : "Lampirkan foto struk kamera atau PDF nota"}
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E2D8]">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={noWritableWallets || transferNeedsMoreWallets}
          >
            Simpan Transaksi
          </Button>
        </div>
      </form>
    </Modal>
  );
}
