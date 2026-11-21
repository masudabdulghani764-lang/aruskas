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
import { formatIDR, getTodayISO } from "@/lib/format";

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
  const [attachment, setAttachment] = useState<File | null>(null);

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

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setAttachment(null);
      return;
    }

    if (!ALLOWED_MIMES.has(file.type.toLowerCase())) {
      setErrorMsg("Format lampiran harus JPG, PNG, WebP, atau PDF.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setErrorMsg("Ukuran lampiran maksimal 2 MB.");
      event.target.value = "";
      return;
    }

    setErrorMsg(null);
    setAttachment(file);
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
          body: JSON.stringify({
            walletId,
            targetWalletId: txType === "transfer" ? targetWalletId : null,
            categoryId: txType === "transfer" ? null : categoryId,
            type: txType,
            amount: parsedAmount,
            title: trimmedTitle,
            paymentMethod: paymentMethod.trim() || null,
            notes: notes.trim() || null,
            occurredAt,
          }),
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
      const msg = "Terjadi gangguan jaringan saat menyimpan transaksi.";
      setErrorMsg(msg);
      toast.error(msg);
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

        {/* Nominal Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="quick-add-amount"
            className="block text-xs font-medium text-[#57534E]"
          >
            Nominal <span className="text-[#B91C1C]">*</span>
          </label>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 font-display text-lg text-[#78716C]">
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
              className="tnum font-display w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-3 pl-11 pr-4 text-2xl font-medium text-[#1C1917] placeholder:text-[#78716C]/50 transition-colors focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15 disabled:bg-[#EFECE4]"
            />
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

        {/* Optional Receipt Attachment */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[#57534E]">
            Bukti Nota (Opsional · JPG, PNG, WebP, PDF maks. 2 MB)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileChange}
            disabled={noWritableWallets}
            className="sr-only"
            id="quick-add-attachment"
          />

          {attachment ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] px-3 py-2 text-xs">
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
          ) : (
            <label
              htmlFor="quick-add-attachment"
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#E7E2D8] bg-[#F7F5F0]/60 px-3.5 py-2.5 text-xs font-medium text-[#57534E] transition-colors hover:border-[#14532D]/40 hover:bg-[#EFECE4]/60 cursor-pointer",
                noWritableWallets && "pointer-events-none opacity-55"
              )}
            >
              <Paperclip className="h-3.5 w-3.5 text-[#78716C]" />
              <span>Lampirkan foto struk atau PDF nota</span>
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
