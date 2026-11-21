"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Plus,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Input,
  Modal,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import { formatIDR, getTodayISO } from "@/lib/format";
import type { SplitBillView } from "@/lib/split-bills";

type ParticipantDraft = {
  id: string;
  name: string;
  amountDigits: string;
  isPaid: boolean;
};

export interface SplitBillModalProps {
  open: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultTotalAmount?: number;
  defaultOccurredAt?: string;
  defaultTransactionId?: string | null;
  onCreated?: (bill: SplitBillView) => void;
}

function formatDigitsIDR(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function distributeEqually(
  total: number,
  list: ParticipantDraft[]
): ParticipantDraft[] {
  const count = list.length;
  if (count === 0 || total <= 0) {
    return list.map((p) => ({ ...p, amountDigits: "" }));
  }
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return list.map((p, idx) => ({
    ...p,
    amountDigits: String(idx === 0 ? base + remainder : base),
  }));
}

/**
 * Interactive Split Bill (Patungan) creator modal supporting equal split, custom
 * per-person amounts, payment transfer info, and instant WhatsApp/public link sharing.
 */
export function SplitBillModal({
  open,
  onClose,
  defaultTitle = "",
  defaultTotalAmount = 0,
  defaultOccurredAt,
  defaultTransactionId = null,
  onCreated,
}: SplitBillModalProps) {
  const [title, setTitle] = useState("");
  const [totalDigits, setTotalDigits] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => getTodayISO());
  const [bankName, setBankName] = useState("BCA");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdBill, setCreatedBill] = useState<SplitBillView | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const initTotal =
      defaultTotalAmount > 0 ? Math.round(defaultTotalAmount) : 0;
    setTitle(defaultTitle);
    setTotalDigits(initTotal > 0 ? String(initTotal) : "");
    setOccurredAt(defaultOccurredAt ?? getTodayISO());
    setBankName("BCA");
    setAccountNumber("");
    setAccountHolder("");
    setNotes("");
    setSplitMode("equal");
    setErrorMsg(null);
    setCreatedBill(null);
    setCopiedLink(false);

    const starter: ParticipantDraft[] = [
      { id: "p1", name: "Saya (Pencatat)", amountDigits: "", isPaid: true },
      { id: "p2", name: "Teman 1", amountDigits: "", isPaid: false },
    ];
    setParticipants(
      initTotal > 0 ? distributeEqually(initTotal, starter) : starter
    );
  }, [open, defaultTitle, defaultTotalAmount, defaultOccurredAt]);

  const parsedTotal = Number(totalDigits || "0");

  // Keep equal distribution synced when total or mode changes
  useEffect(() => {
    if (!open || splitMode !== "equal") {
      return;
    }
    setParticipants((prev) => distributeEqually(parsedTotal, prev));
  }, [open, splitMode, parsedTotal]);

  const participantsSum = useMemo(
    () =>
      participants.reduce((sum, p) => sum + Number(p.amountDigits || "0"), 0),
    [participants]
  );

  const sumMismatch =
    parsedTotal > 0 && participantsSum !== parsedTotal
      ? parsedTotal - participantsSum
      : 0;

  function addParticipant() {
    if (participants.length >= 30) {
      toast.error("Maksimal 30 peserta per patungan.");
      return;
    }
    setParticipants((prev) => {
      const next: ParticipantDraft[] = [
        ...prev,
        {
          id: `p-${Date.now()}-${prev.length + 1}`,
          name: `Teman ${prev.length}`,
          amountDigits: "",
          isPaid: false,
        },
      ];
      return splitMode === "equal"
        ? distributeEqually(parsedTotal, next)
        : next;
    });
  }

  function removeParticipant(id: string) {
    if (participants.length <= 2) {
      toast.error("Minimal 2 peserta untuk patungan.");
      return;
    }
    setParticipants((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return splitMode === "equal"
        ? distributeEqually(parsedTotal, filtered)
        : filtered;
    });
  }

  function updateParticipant(
    id: string,
    patch: Partial<ParticipantDraft>
  ) {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim() || title.trim().length < 2) {
      setErrorMsg("Judul patungan minimal 2 karakter.");
      return;
    }
    if (!Number.isSafeInteger(parsedTotal) || parsedTotal <= 0) {
      setErrorMsg("Total tagihan harus lebih dari Rp 0.");
      return;
    }

    const cleanParticipants = participants.map((p) => ({
      name: p.name.trim(),
      amount: Number(p.amountDigits || "0"),
      isPaid: p.isPaid,
    }));

    if (cleanParticipants.some((p) => !p.name)) {
      setErrorMsg("Semua nama peserta wajib diisi.");
      return;
    }
    if (cleanParticipants.some((p) => !Number.isSafeInteger(p.amount) || p.amount <= 0)) {
      setErrorMsg("Nominal setiap peserta harus lebih dari Rp 0.");
      return;
    }
    if (participantsSum !== parsedTotal) {
      setErrorMsg(
        `Total bagian peserta (${formatIDR(participantsSum)}) harus sama dengan total tagihan (${formatIDR(parsedTotal)}).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/split-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          totalAmount: parsedTotal,
          occurredAt,
          transactionId: defaultTransactionId || null,
          bankName: bankName.trim() || null,
          accountNumber: accountNumber.trim() || null,
          accountHolder: accountHolder.trim() || null,
          notes: notes.trim() || null,
          participants: cleanParticipants,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal membuat link patungan.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      const bill = data.splitBill as SplitBillView;
      setCreatedBill(bill);
      toast.success("Link patungan berhasil dibuat & siap dibagikan!");
      onCreated?.(bill);
    } catch {
      const msg = "Terjadi gangguan jaringan saat membuat patungan.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const shareUrl =
    createdBill && typeof window !== "undefined"
      ? `${window.location.origin}/patungan/${createdBill.slug}`
      : createdBill
        ? `/patungan/${createdBill.slug}`
        : "";

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast.success("Link patungan berhasil disalin.");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Gagal menyalin link.");
    }
  }

  function buildWhatsAppShareUrl(bill: SplitBillView, url: string): string {
    const lines = [
      `Halo! Ini rincian patungan *${bill.title}*`,
      `Total: ${formatIDR(bill.totalAmount)}`,
      "",
      ...bill.participants.map(
        (p) =>
          `${p.isPaid ? "✅" : "⏳"} ${p.name}: ${formatIDR(p.amount)}`
      ),
    ];
    if (bill.bankName || bill.accountNumber) {
      lines.push(
        "",
        `Transfer ke: ${[bill.bankName, bill.accountNumber, bill.accountHolder ? `a.n. ${bill.accountHolder}` : ""].filter(Boolean).join(" · ")}`
      );
    }
    lines.push("", `Lihat detail & status lunas: ${url}`);
    return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={createdBill ? "Link Patungan Siap Dibagikan!" : "Bagi Tagihan (Split Bill)"}
      description={
        createdBill
          ? "Bagikan link ini ke grup WhatsApp agar teman Anda melihat rincian dan nomor rekening transfer."
          : "Hitung patungan otomatis dan buat halaman rincian publik yang bisa dibuka tanpa login."
      }
      size="md"
    >
      {createdBill ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7]/45 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#14532D]">
                {createdBill.title}
              </p>
              <span className="tnum text-sm font-bold text-[#14532D]">
                {formatIDR(createdBill.totalAmount)}
              </span>
            </div>
            <p className="text-xs text-[#166534]">
              {createdBill.totalCount} peserta · {createdBill.paidCount} sudah lunas
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[#57534E]">
              Link Publik Patungan
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-xl border border-[#E3D4BA] bg-[#FAF1E0] px-3 py-2 text-xs text-[#1C1917]">
                {shareUrl}
              </code>
              <Button type="button" size="sm" variant="secondary" onClick={copyShareLink}>
                {copiedLink ? (
                  <Check className="h-3.5 w-3.5 text-[#15803D]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>Salin</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a
              href={buildWhatsAppShareUrl(createdBill, shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#14532D] px-4 text-sm font-semibold text-[#FFFFFF] transition-colors hover:bg-[#166534]"
            >
              <Share2 className="h-4 w-4" />
              <span>Bagikan ke WhatsApp</span>
            </a>
            <a
              href={`/patungan/${createdBill.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E3D4BA] bg-[#FFFFFF] px-4 text-sm font-semibold text-[#1C1917] transition-colors hover:bg-[#FAF1E0]"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Buka Halaman Publik</span>
            </a>
          </div>

          <div className="flex justify-end border-t border-[#E7E2D8] pt-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Selesai
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs text-[#B91C1C]"
            >
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Judul Patungan"
              required
              maxLength={120}
              placeholder="Contoh: Makan Malam Tim, Villa Bandung"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="split-total"
                className="block text-xs font-medium text-[#57534E]"
              >
                Total Tagihan <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-xs font-semibold text-[#78716C]">
                  Rp
                </span>
                <input
                  id="split-total"
                  type="text"
                  inputMode="numeric"
                  placeholder="250.000"
                  value={formatDigitsIDR(totalDigits)}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .replace(/^0+/, "");
                    if (digits.length <= 15) setTotalDigits(digits);
                  }}
                  className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                />
              </div>
            </div>
          </div>

          {/* Mode Toggle + Participants */}
          <div className="rounded-2xl border border-[#E3D4BA] bg-[#FAF1E0]/55 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                <Users className="h-3.5 w-3.5 text-[#14532D]" />
                <span>Daftar Peserta ({participants.length})</span>
              </div>
              <div className="inline-flex rounded-lg border border-[#E3D4BA] bg-[#FFFFFF] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSplitMode("equal")}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium cursor-pointer transition-colors",
                    splitMode === "equal"
                      ? "bg-[#14532D] text-[#FFFFFF]"
                      : "text-[#57534E]"
                  )}
                >
                  Bagi Rata
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("custom")}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium cursor-pointer transition-colors",
                    splitMode === "custom"
                      ? "bg-[#14532D] text-[#FFFFFF]"
                      : "text-[#57534E]"
                  )}
                >
                  Nominal Kustom
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {participants.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] p-2"
                >
                  <input
                    type="text"
                    placeholder={`Peserta ${idx + 1}`}
                    value={p.name}
                    maxLength={60}
                    onChange={(e) =>
                      updateParticipant(p.id, { name: e.target.value })
                    }
                    className="min-w-0 flex-1 rounded-lg border border-[#E7E2D8] bg-[#FAF8F4] px-2.5 py-1.5 text-xs text-[#1C1917] focus:border-[#14532D] focus:bg-[#FFFFFF] focus:outline-none"
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[#78716C]">
                      Rp
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={splitMode === "equal"}
                      value={formatDigitsIDR(p.amountDigits)}
                      onChange={(e) => {
                        const d = e.target.value
                          .replace(/\D/g, "")
                          .replace(/^0+/, "");
                        if (d.length <= 15) {
                          updateParticipant(p.id, { amountDigits: d });
                        }
                      }}
                      className="tnum w-full rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] py-1.5 pl-7 pr-2 text-xs font-semibold text-[#1C1917] disabled:bg-[#FAF1E0] disabled:text-[#57534E] focus:border-[#14532D] focus:outline-none"
                    />
                  </div>
                  <label
                    title="Tandai sudah bayar"
                    className="inline-flex items-center gap-1 text-[11px] text-[#57534E] shrink-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={p.isPaid}
                      onChange={(e) =>
                        updateParticipant(p.id, { isPaid: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-[#14532D]"
                    />
                    <span className="hidden sm:inline">Lunas</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Hapus ${p.name}`}
                    onClick={() => removeParticipant(p.id)}
                    className="rounded-md p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#B91C1C] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={addParticipant}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#14532D]/40 bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#DCFCE7]/40 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Orang</span>
              </button>
              <span
                className={cn(
                  "tnum text-xs font-semibold",
                  sumMismatch === 0 ? "text-[#15803D]" : "text-[#B91C1C]"
                )}
              >
                {sumMismatch === 0
                  ? `Pas: ${formatIDR(participantsSum)}`
                  : `Selisih: ${formatIDR(sumMismatch, { signed: true })}`}
              </span>
            </div>
          </div>

          {/* Transfer Destination Info */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-[#57534E]">
              Tujuan Transfer (Opsional — tampil di halaman publik)
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Input
                label="Bank / E-Wallet"
                placeholder="BCA / GoPay / SeaBank"
                maxLength={60}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              <Input
                label="No. Rekening / HP"
                placeholder="8821004921"
                maxLength={60}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="tnum"
              />
              <Input
                label="Atas Nama"
                placeholder="Nama penerima"
                maxLength={100}
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Tanggal"
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="tnum"
            />
            <Textarea
              label="Catatan (Opsional)"
              rows={2}
              maxLength={500}
              placeholder="Contoh: Transfer maksimal hari Jumat ya"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#E7E2D8] pt-3">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              <Share2 className="h-3.5 w-3.5" />
              <span>Buat Link Patungan</span>
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
