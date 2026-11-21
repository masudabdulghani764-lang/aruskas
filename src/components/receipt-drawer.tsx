"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Download,
  ExternalLink,
  FileText,
  Paperclip,
  Pencil,
  Share2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SplitBillModal } from "@/components/split-bill-modal";
import {
  Badge,
  Button,
  Drawer,
  Input,
  Select,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import { compressReceiptImageIfNeeded } from "@/lib/client-image";
import { formatDateID, formatIDR } from "@/lib/format";
import type { TransactionView } from "@/lib/transactions";
import type { WalletWithRole } from "@/lib/wallets";

interface CategoryOption {
  id: string;
  userId: string;
  name: string;
  type: "income" | "expense";
  color: string;
}

export interface ReceiptDrawerProps {
  transaction: TransactionView | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: (updated: TransactionView) => void;
  onDeleted?: (deletedId: string) => void;
}

const PAYMENT_METHODS = [
  "Transfer Bank",
  "QRIS",
  "Tunai",
  "Kartu Debit",
  "Kartu Kredit",
  "E-Wallet",
  "Auto-Debit",
] as const;

function formatDigitsIDR(digits: string): string {
  if (!digits) {
    return "";
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getTypeMeta(type: TransactionView["type"]) {
  if (type === "income") {
    return {
      label: "Pemasukan",
      badgeVariant: "inflow" as const,
      amountClass: "text-[#15803D]",
      icon: ArrowDownLeft,
    };
  }
  if (type === "transfer") {
    return {
      label: "Transfer",
      badgeVariant: "neutral" as const,
      amountClass: "text-[#44403C]",
      icon: ArrowLeftRight,
    };
  }
  return {
    label: "Pengeluaran",
    badgeVariant: "outflow" as const,
    amountClass: "text-[#B91C1C]",
    icon: ArrowUpRight,
  };
}

/**
 * Receipt-styled slide-over drawer displaying full transaction details, attachment
 * previews, and RBAC-gated inline edit & delete actions.
 */
export function ReceiptDrawer({
  transaction,
  open,
  onClose,
  onUpdated,
  onDeleted,
}: ReceiptDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [editAttachment, setEditAttachment] = useState<File | null>(null);
  const [removeExistingAttachment, setRemoveExistingAttachment] =
    useState(false);
  const [compressingEditImage, setCompressingEditImage] = useState(false);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Synchronize local edit state whenever the inspected transaction changes.
  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
    setErrorMsg(null);
    setSubmitting(false);
    setDeleting(false);
    setEditAttachment(null);
    setRemoveExistingAttachment(false);

    if (!transaction) {
      return;
    }

    setTitle(transaction.title);
    setAmountDigits(String(transaction.amount));
    setCategoryId(transaction.categoryId ?? "");
    setOccurredAt(transaction.occurredAt);
    setPaymentMethod(transaction.paymentMethod ?? "");
    setNotes(transaction.notes ?? "");
  }, [transaction, open]);

  // Load owner categories when entering edit mode for non-transfer transactions.
  useEffect(() => {
    if (
      !open ||
      !editing ||
      !transaction ||
      !transaction.canEdit ||
      transaction.type === "transfer"
    ) {
      return;
    }

    let cancelled = false;
    setLoadingCategories(true);

    async function loadCategories() {
      try {
        const walletsRes = await fetch("/api/wallets?includeArchived=true", {
          cache: "no-store",
        });
        const walletsData = await walletsRes.json().catch(() => ({}));
        if (!walletsRes.ok) {
          throw new Error(walletsData.error ?? "Gagal memuat daftar dompet.");
        }
        if (cancelled) {
          return;
        }
        const walletList = Array.isArray(walletsData.wallets)
          ? (walletsData.wallets as WalletWithRole[])
          : [];
        const sourceWallet = walletList.find(
          (w) => w.id === transaction!.walletId
        );
        const ownerQuery = sourceWallet?.ownerId
          ? `ownerId=${encodeURIComponent(sourceWallet.ownerId)}&`
          : "";

        const catRes = await fetch(
          `/api/categories?${ownerQuery}type=${encodeURIComponent(transaction!.type)}`,
          { cache: "no-store" }
        );
        const catData = await catRes.json().catch(() => ({}));
        if (!catRes.ok) {
          throw new Error(catData.error ?? "Gagal memuat daftar kategori.");
        }
        if (!cancelled) {
          const list = Array.isArray(catData.categories)
            ? (catData.categories as CategoryOption[])
            : [];
          setCategories(list);
          if (
            list.length > 0 &&
            !list.some((c) => c.id === transaction!.categoryId)
          ) {
            setCategoryId(list[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : "Gagal memuat daftar kategori.";
          setErrorMsg(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) {
          setLoadingCategories(false);
        }
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [open, editing, transaction]);

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

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!transaction || !transaction.canEdit) {
      return;
    }

    setErrorMsg(null);

    const parsedAmount = Number(amountDigits);
    if (
      !amountDigits ||
      !Number.isSafeInteger(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setErrorMsg("Nominal harus berupa bilangan bulat lebih dari Rp 0.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg("Judul transaksi wajib diisi.");
      return;
    }

    if (transaction.type !== "transfer" && !categoryId) {
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
      if (editAttachment) {
        const fd = new FormData();
        fd.set("title", trimmedTitle);
        fd.set("amount", String(parsedAmount));
        fd.set("occurredAt", occurredAt);
        fd.set("paymentMethod", paymentMethod.trim());
        fd.set("notes", notes.trim());
        if (transaction.type !== "transfer") {
          fd.set("categoryId", categoryId);
        }
        fd.set("attachment", editAttachment);
        res = await fetch(
          `/api/transactions/${encodeURIComponent(transaction.id)}`,
          {
            method: "PATCH",
            body: fd,
          }
        );
      } else {
        const payload: Record<string, unknown> = {
          title: trimmedTitle,
          amount: parsedAmount,
          occurredAt,
          paymentMethod: paymentMethod.trim() || null,
          notes: notes.trim() || null,
        };
        if (transaction.type !== "transfer") {
          payload.categoryId = categoryId;
        }
        if (removeExistingAttachment) {
          payload.removeAttachment = true;
        }

        res = await fetch(
          `/api/transactions/${encodeURIComponent(transaction.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal memperbarui transaksi.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success("Perubahan transaksi berhasil disimpan.");
      setEditing(false);
      if (data.transaction) {
        onUpdated?.(data.transaction as TransactionView);
      }
    } catch {
      const msg = "Terjadi gangguan jaringan saat menyimpan perubahan.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!transaction || !transaction.canEdit) {
      return;
    }

    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(transaction.id)}`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal menghapus transaksi.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success("Transaksi berhasil dihapus.");
      setConfirmDelete(false);
      onDeleted?.(transaction.id);
      onClose();
    } catch {
      const msg = "Terjadi gangguan jaringan saat menghapus transaksi.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  const typeMeta = transaction ? getTypeMeta(transaction.type) : null;
  const TypeIcon = typeMeta?.icon ?? ArrowUpRight;
  const attachmentUrl = transaction
    ? `/api/attachments/${encodeURIComponent(transaction.id)}`
    : "";
  const isImageAttachment = Boolean(
    transaction?.attachmentMime?.toLowerCase().startsWith("image/")
  );

  const customPaymentMethodMissing =
    Boolean(paymentMethod) &&
    !PAYMENT_METHODS.some((method) => method === paymentMethod);

  return (
    <Drawer
      open={open && Boolean(transaction)}
      onClose={onClose}
      title={editing ? "Ubah Transaksi" : "Struk Transaksi"}
      subtitle={
        editing
          ? "Perbarui nominal, kategori, atau catatan transaksi"
          : "Bukti pencatatan arus kas"
      }
      footer={
        transaction && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {transaction.canEdit ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    setErrorMsg(null);
                    setEditing(true);
                  }}
                  disabled={deleting}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDelete((prev) => !prev)}
                  disabled={deleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Hapus</span>
                </Button>
                {transaction.type === "expense" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSplitModalOpen(true)}
                    disabled={deleting}
                  >
                    <Share2 className="h-3.5 w-3.5 text-[#14532D]" />
                    <span>Patungan</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-[#78716C]">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Hanya dapat diubah oleh pemilik dompet/pencatat</span>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </div>
        ) : undefined
      }
    >
      {transaction && typeMeta && (
        <div className="space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {errorMsg}
            </div>
          )}

          {editing && transaction.canEdit ? (
            <form onSubmit={handleSaveEdit} noValidate className="space-y-4">
              <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-xs text-[#57534E]">
                  Dompet:{" "}
                  <strong className="font-semibold text-[#1C1917]">
                    {transaction.walletName}
                    {transaction.type === "transfer" &&
                    transaction.targetWalletName
                      ? ` → ${transaction.targetWalletName}`
                      : ""}
                  </strong>
                </span>
                <Badge variant={typeMeta.badgeVariant}>{typeMeta.label}</Badge>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="receipt-edit-amount"
                  className="block text-xs font-medium text-[#57534E]"
                >
                  Nominal <span className="text-[#B91C1C]">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3.5 font-display text-lg text-[#78716C]">
                    Rp
                  </span>
                  <input
                    id="receipt-edit-amount"
                    type="text"
                    inputMode="numeric"
                    value={formatDigitsIDR(amountDigits)}
                    onChange={handleAmountChange}
                    className="tnum font-display w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-11 pr-4 text-2xl font-medium text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                  />
                </div>
              </div>

              <Input
                label="Judul Transaksi"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              {transaction.type !== "transfer" && (
                <Select
                  label="Kategori"
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={loadingCategories}
                >
                  {loadingCategories ? (
                    <option value="">Memuat kategori...</option>
                  ) : categories.length === 0 ? (
                    <option value={categoryId}>
                      {transaction.categoryName ?? "Kategori"}
                    </option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))
                  )}
                </Select>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Tanggal"
                  type="date"
                  required
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="tnum"
                />

                <Select
                  label="Metode Pembayaran"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">Tidak dicatat</option>
                  {customPaymentMethodMissing && (
                    <option value={paymentMethod}>{paymentMethod}</option>
                  )}
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </Select>
              </div>

              <Textarea
                label="Catatan"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tambahkan keterangan transaksi..."
              />

              {/* Edit / Replace / Remove Receipt Attachment */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-[#57534E]">
                  Lampiran Struk / Nota
                </span>
                <input
                  id="receipt-edit-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  disabled={compressingEditImage || submitting}
                  onChange={async (e) => {
                    const raw = e.target.files?.[0];
                    e.target.value = "";
                    if (!raw) return;
                    setCompressingEditImage(true);
                    try {
                      const compressed = await compressReceiptImageIfNeeded(raw);
                      if (compressed.size > 2 * 1024 * 1024) {
                        setErrorMsg("Ukuran lampiran maksimal 2 MB.");
                        return;
                      }
                      setEditAttachment(compressed);
                      setRemoveExistingAttachment(false);
                      setErrorMsg(null);
                    } finally {
                      setCompressingEditImage(false);
                    }
                  }}
                />
                {editAttachment ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E3D4BA] bg-[#FAF0DD]/60 px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[#14532D]" />
                      <span className="truncate font-medium text-[#1C1917]">
                        {editAttachment.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditAttachment(null)}
                      className="rounded-md p-1 text-[#78716C] hover:text-[#B91C1C] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : transaction.hasAttachment && !removeExistingAttachment ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E3D4BA] bg-[#FAF0DD]/50 px-3 py-2 text-xs">
                    <span className="truncate font-medium text-[#1C1917]">
                      {transaction.attachmentName ?? "Struk terlampir"}
                    </span>
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="receipt-edit-file"
                        className="font-semibold text-[#14532D] hover:underline cursor-pointer"
                      >
                        Ganti
                      </label>
                      <button
                        type="button"
                        onClick={() => setRemoveExistingAttachment(true)}
                        className="font-semibold text-[#B91C1C] hover:underline cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="receipt-edit-file"
                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#E3D4BA] bg-[#FAF0DD]/40 px-3.5 py-2.5 text-xs font-medium text-[#57534E] hover:border-[#14532D]/40 cursor-pointer"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-[#78716C]" />
                    <span>
                      {compressingEditImage
                        ? "Mengoptimalkan foto struk..."
                        : "Tambah / ganti foto struk atau PDF"}
                    </span>
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E2D8]">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setErrorMsg(null);
                  }}
                  disabled={submitting}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                >
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          ) : (
            <>
              {/* Receipt Paper Sheet */}
              <div className="rounded-2xl border border-[#E7E2D8] bg-[#F7F5F0]/70 p-5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={typeMeta.badgeVariant}>
                    <TypeIcon className="h-3 w-3" />
                    <span>{typeMeta.label}</span>
                  </Badge>
                  <span className="tnum text-xs text-[#78716C]">
                    {formatDateID(transaction.occurredAt)}
                  </span>
                </div>

                <div className="mt-4">
                  <p
                    className={cn(
                      "tnum font-display text-3xl font-medium tracking-tight",
                      typeMeta.amountClass
                    )}
                  >
                    {transaction.type === "income"
                      ? formatIDR(transaction.amount, { signed: true })
                      : transaction.type === "expense"
                        ? formatIDR(-transaction.amount, { signed: true })
                        : formatIDR(transaction.amount)}
                  </p>
                  <h3 className="mt-1.5 text-base font-semibold text-[#1C1917] leading-snug">
                    {transaction.title}
                  </h3>
                </div>

                <div className="my-4 border-t border-dashed border-[#D6CFC2]" />

                <dl className="space-y-2.5 text-xs sm:text-sm">
                  {transaction.type === "transfer" ? (
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-[#78716C] shrink-0">Rute Transfer</dt>
                      <dd className="text-right font-medium text-[#1C1917]">
                        {transaction.walletName} →{" "}
                        {transaction.targetWalletName ??
                          transaction.counterpartyWalletName ??
                          "-"}
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-[#78716C] shrink-0">Dompet</dt>
                        <dd className="text-right font-medium text-[#1C1917]">
                          {transaction.walletName}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-[#78716C] shrink-0">Kategori</dt>
                        <dd className="flex items-center justify-end gap-1.5 font-medium text-[#1C1917]">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                transaction.categoryColor ?? "#78716C",
                            }}
                          />
                          <span>
                            {transaction.categoryName ?? "Tanpa Kategori"}
                          </span>
                        </dd>
                      </div>
                    </>
                  )}

                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[#78716C] shrink-0">Pencatat</dt>
                    <dd className="text-right font-medium text-[#1C1917]">
                      {transaction.recorderName}
                    </dd>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[#78716C] shrink-0">
                      Metode Pembayaran
                    </dt>
                    <dd className="text-right font-medium text-[#1C1917]">
                      {transaction.paymentMethod ?? "Tidak dicatat"}
                    </dd>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[#78716C] shrink-0">Tanggal</dt>
                    <dd className="tnum text-right font-medium text-[#1C1917]">
                      {formatDateID(transaction.occurredAt)}
                    </dd>
                  </div>
                </dl>

                {transaction.notes && (
                  <>
                    <div className="my-4 border-t border-dashed border-[#D6CFC2]" />
                    <div>
                      <p className="text-xs font-medium text-[#78716C]">
                        Catatan
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs sm:text-sm text-[#1C1917] leading-relaxed">
                        {transaction.notes}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Delete Confirmation Box */}
              {confirmDelete && transaction.canEdit && (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/45 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-[#B91C1C]">
                      Konfirmasi Penghapusan
                    </p>
                    <p className="mt-0.5 text-xs text-[#57534E] leading-relaxed">
                      Transaksi akan dihapus permanen dan saldo dompet terkait
                      akan disesuaikan kembali secara atomik.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                    >
                      Batal
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleting}
                      onClick={handleDelete}
                    >
                      Ya, Hapus Transaksi
                    </Button>
                  </div>
                </div>
              )}

              {/* Attachment Preview / Download */}
              {transaction.hasAttachment && (
                <div className="rounded-2xl border border-[#E7E2D8] bg-[#FFFFFF] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#1C1917]">
                      Bukti Nota Terlampir
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#14532D] hover:underline"
                      >
                        <span>Buka</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={attachmentUrl}
                        download={transaction.attachmentName ?? "bukti-nota"}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#57534E] hover:text-[#1C1917] hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        <span>Unduh</span>
                      </a>
                    </div>
                  </div>

                  {isImageAttachment ? (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachmentUrl}
                        alt={transaction.attachmentName ?? "Bukti nota"}
                        className="max-h-72 w-full object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] px-3.5 py-3 text-xs transition-colors hover:bg-[#EFECE4]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-[#14532D]" />
                        <span className="truncate font-medium text-[#1C1917]">
                          {transaction.attachmentName ?? "Bukti Nota.pdf"}
                        </span>
                      </div>
                      <span className="shrink-0 font-medium text-[#14532D]">
                        Lihat PDF
                      </span>
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {transaction && transaction.type === "expense" && (
        <SplitBillModal
          open={splitModalOpen}
          onClose={() => setSplitModalOpen(false)}
          defaultTitle={transaction.title}
          defaultTotalAmount={transaction.amount}
          defaultOccurredAt={transaction.occurredAt}
          defaultTransactionId={transaction.id}
        />
      )}
    </Drawer>
  );
}
