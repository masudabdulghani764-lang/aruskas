"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  History,
  KeyRound,
  Landmark,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import type {
  BcaCsvPreviewRow,
  BcaIntegrationView,
  BcaSyncLogView,
} from "@/lib/bca-integration";
import { formatDateID, formatIDR } from "@/lib/format";
import type { WalletWithRole } from "@/lib/wallets";

type ActiveTab = "webhook" | "csv" | "logs";
type GuideTab = "gmail" | "android" | "ios";

const SAMPLE_NOTIFICATIONS = [
  {
    label: "Transfer Masuk",
    subject: "Notifikasi Transfer Masuk myBCA",
    text: "Anda menerima transfer sebesar Rp 2.500.000,00 dari PT NUSANTARA DIGITAL ke rekening BCA Anda pada tanggal 21/11/2026. No. Ref: BCA2026112101",
  },
  {
    label: "Bayar QRIS",
    subject: "Transaksi QRIS myBCA Berhasil",
    text: "Pembayaran QRIS di KOPI KENANGAN GRAND INDONESIA sebesar Rp 42.000,00 pada 21/11/2026 berhasil. Ref: QRIS2026112102",
  },
  {
    label: "Virtual Account",
    subject: "Pembayaran BCA Virtual Account",
    text: "Pembayaran Virtual Account TOKOPEDIA sebesar Rp 275.000,00 pada 21/11/2026 berhasil. No. Ref: VA2026112103",
  },
] as const;

const SAMPLE_BCA_CSV = [
  "Informasi Rekening",
  "No. Rekening,=,8821004921",
  "Nama,=,PEMILIK REKENING BCA",
  "Periode,=,01/11/2026 - 30/11/2026",
  "",
  "Tanggal,Keterangan,Cabang,Jumlah,Saldo",
  "'02/11,TRSF E-BANKING CR 11/02 PT NUSANTARA GAJI BULANAN,0000,\"14,500,000.00 CR\",\"28,500,000.00\"",
  "'04/11,QR 004 KOPI KENANGAN SUDIRMAN,0000,\"38,000.00 DB\",\"28,462,000.00\"",
  "'07/11,TRSF E-BANKING DB BCA VA PLN LISTRIK,0000,\"625,000.00 DB\",\"27,837,000.00\"",
  "'11/11,TRSF E-BANKING DB TOKOPEDIA BELANJA RUMAH,0000,\"340,000.00 DB\",\"27,497,000.00\"",
  "'15/11,BI-FAST CR 11/15 KLIEN PROYEK WEBSITE,0000,\"3,500,000.00 CR\",\"30,997,000.00\"",
  "'PEND,QR 004 TRANSAKSI BELUM SETTLED,0000,\"19,000.00 DB\",\"30,978,000.00\"",
  "Saldo Awal,=,14,000,000.00",
].join("\n");

function buildGmailAppsScript(webhookUrl: string, tokenPlaceholder: string): string {
  return `// Tempel ke https://script.google.com lalu pasang Trigger "Time-driven" tiap 5 menit
const ARUSKAS_WEBHOOK_URL = "${webhookUrl}";
const ARUSKAS_TOKEN = "${tokenPlaceholder}";

function syncNotifikasiBCA() {
  const labelName = "ArusKas-Synced";
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) label = GmailApp.createLabel(labelName);

  // Cari email notifikasi dari BCA yang belum pernah disinkronkan
  const query = 'from:(bca@bca.co.id OR noreply@bca.co.id OR mybca) -label:' + labelName + ' newer_than:7d';
  const threads = GmailApp.search(query, 0, 20);

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const payload = {
        subject: msg.getSubject(),
        text: msg.getPlainBody().slice(0, 4000),
        source: "webhook_email",
        externalId: msg.getId(),
      };

      const res = UrlFetchApp.fetch(ARUSKAS_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + ARUSKAS_TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const code = res.getResponseCode();
      if (code === 200 || code === 201) {
        thread.addLabel(label);
      }
    }
  }
}`;
}

export function BcaIntegrationClient({
  initialIntegration,
  initialLogs,
  initialWallets,
}: {
  initialIntegration: BcaIntegrationView | null;
  initialLogs: BcaSyncLogView[];
  initialWallets: WalletWithRole[];
}) {
  const { triggerRefresh } = useQuickAdd();

  const [tab, setTab] = useState<ActiveTab>("webhook");
  const [guideTab, setGuideTab] = useState<GuideTab>("gmail");
  const [origin, setOrigin] = useState("http://localhost:3000");

  const [integration, setIntegration] = useState<BcaIntegrationView | null>(
    initialIntegration
  );
  const [logs, setLogs] = useState<BcaSyncLogView[]>(initialLogs);
  const [wallets] = useState<WalletWithRole[]>(initialWallets);

  // Default to existing BCA wallet if present
  const defaultWalletId = useMemo(() => {
    if (initialIntegration?.walletId) return initialIntegration.walletId;
    const bcaMatch = initialWallets.find((w) =>
      w.name.toLowerCase().includes("bca")
    );
    return bcaMatch?.id ?? initialWallets[0]?.id ?? "";
  }, [initialIntegration, initialWallets]);

  const [selectedWalletId, setSelectedWalletId] = useState(defaultWalletId);
  const [isActive, setIsActive] = useState(initialIntegration?.isActive ?? true);
  const [autoCategorize, setAutoCategorize] = useState(
    initialIntegration?.autoCategorize ?? true
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [freshRawToken, setFreshRawToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Simulator state
  const [simSubject, setSimSubject] = useState<string>(
    SAMPLE_NOTIFICATIONS[0].subject
  );
  const [simText, setSimText] = useState<string>(SAMPLE_NOTIFICATIONS[0].text);
  const [simBusy, setSimBusy] = useState(false);
  const [simPreview, setSimPreview] = useState<{
    type: "income" | "expense";
    amount: number;
    title: string;
    occurredAt: string;
    paymentMethod: string;
    suggestedCategoryName: string;
  } | null>(null);

  // CSV import state
  const [csvWalletId, setCsvWalletId] = useState(defaultWalletId);
  const [csvText, setCsvText] = useState("");
  const [csvPreviewRows, setCsvPreviewRows] = useState<BcaCsvPreviewRow[]>([]);
  const [csvCategories, setCsvCategories] = useState<
    Array<{ id: string; name: string; type: "income" | "expense" }>
  >([]);
  const [csvSelectedHashes, setCsvSelectedHashes] = useState<Set<string>>(
    new Set()
  );
  const [csvCategoryOverrides, setCsvCategoryOverrides] = useState<
    Record<string, string>
  >({});
  const [csvMeta, setCsvMeta] = useState<{
    skippedPending: number;
    skippedInvalid: number;
    detectedPeriod: string | null;
  } | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const webhookUrl = `${origin}/api/integrations/bca/webhook`;
  const tokenForGuide =
    freshRawToken ?? integration?.tokenPrefix ?? "TEMPATKAN_TOKEN_BCA_ANDA";
  const appsScriptCode = useMemo(
    () => buildGmailAppsScript(webhookUrl, tokenForGuide),
    [webhookUrl, tokenForGuide]
  );

  async function refreshIntegrationState() {
    try {
      const res = await fetch("/api/integrations/bca", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setIntegration(data.integration ?? null);
      if (Array.isArray(data.logs)) setLogs(data.logs);
    } catch {
      // silent refresh failure
    }
  }

  async function copyText(key: string, text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} berhasil disalin.`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Gagal menyalin ke clipboard.");
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWalletId) {
      toast.error("Pilih dompet tujuan BCA terlebih dahulu.");
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetch("/api/integrations/bca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: selectedWalletId,
          isActive,
          autoCategorize,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menyimpan pengaturan BCA.");
        return;
      }
      setIntegration(data.integration);
      if (data.rawToken) {
        setFreshRawToken(data.rawToken);
        toast.success(
          "Integrasi BCA aktif! Segera salin Token Rahasia Anda di bawah."
        );
      } else {
        toast.success("Pengaturan otomatisasi Bank BCA disimpan.");
      }
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRotateToken() {
    setRotatingToken(true);
    try {
      const res = await fetch("/api/integrations/bca/rotate-token", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal membuat ulang token.");
        return;
      }
      setIntegration(data.integration);
      setFreshRawToken(data.rawToken);
      toast.success(
        "Token webhook baru dibuat. Token lama otomatis tidak berlaku."
      );
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setRotatingToken(false);
    }
  }

  async function runSimulator(commit: boolean) {
    if (!selectedWalletId) {
      toast.error("Pilih dompet BCA tujuan terlebih dahulu.");
      return;
    }
    if (!simText.trim()) {
      toast.error("Tempel teks notifikasi BCA terlebih dahulu.");
      return;
    }
    setSimBusy(true);
    try {
      const res = await fetch("/api/integrations/bca/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: selectedWalletId,
          subject: simSubject,
          text: simText,
          commit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal membaca notifikasi BCA.");
        return;
      }

      setSimPreview({
        type: data.parsed.type,
        amount: data.parsed.amount,
        title: data.parsed.title,
        occurredAt: data.parsed.occurredAt,
        paymentMethod: data.parsed.paymentMethod,
        suggestedCategoryName: data.suggestedCategoryName,
      });

      if (commit) {
        if (data.result?.status === "duplicate") {
          toast.warning(data.result.message);
        } else {
          toast.success(
            `Berhasil dicatat otomatis ke dompet BCA (${formatIDR(data.parsed.amount)})!`
          );
          triggerRefresh();
        }
        await refreshIntegrationState();
      } else {
        toast.success("Notifikasi BCA berhasil dibaca — cek hasil pratinjau.");
      }
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setSimBusy(false);
    }
  }

  async function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran file CSV maksimal 2MB.");
      return;
    }
    const content = await file.text();
    setCsvText(content);
    await handlePreviewCsv(content);
  }

  async function handlePreviewCsv(overrideText?: string) {
    const content = overrideText ?? csvText;
    if (!csvWalletId) {
      toast.error("Pilih dompet BCA tujuan terlebih dahulu.");
      return;
    }
    if (!content.trim()) {
      toast.error("Upload file CSV mutasi BCA atau muat contoh terlebih dahulu.");
      return;
    }

    setCsvBusy(true);
    try {
      const res = await fetch("/api/integrations/bca/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          walletId: csvWalletId,
          csvText: content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal membaca file CSV BCA.");
        return;
      }

      const rows = (data.rows ?? []) as BcaCsvPreviewRow[];
      setCsvPreviewRows(rows);
      setCsvCategories(data.categories ?? []);
      setCsvMeta({
        skippedPending: data.skippedPending ?? 0,
        skippedInvalid: data.skippedInvalid ?? 0,
        detectedPeriod: data.detectedPeriod ?? null,
      });

      const initialSelected = new Set<string>();
      const overrides: Record<string, string> = {};
      for (const r of rows) {
        overrides[r.dedupeHash] = r.suggestedCategoryId;
        if (!r.isDuplicate) {
          initialSelected.add(r.dedupeHash);
        }
      }
      setCsvSelectedHashes(initialSelected);
      setCsvCategoryOverrides(overrides);
      toast.success(
        `${rows.length} baris mutasi BCA terbaca (${initialSelected.size} baru siap diimpor).`
      );
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleCommitCsv() {
    const chosen = csvPreviewRows.filter((r) =>
      csvSelectedHashes.has(r.dedupeHash)
    );
    if (chosen.length === 0) {
      toast.error("Pilih minimal satu transaksi baru untuk diimpor.");
      return;
    }

    setCsvBusy(true);
    try {
      const res = await fetch("/api/integrations/bca/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          walletId: csvWalletId,
          rows: chosen.map((r) => ({
            type: r.type,
            amount: r.amount,
            title: r.title,
            occurredAt: r.occurredAt,
            paymentMethod: r.paymentMethod,
            notes: r.notes,
            dedupeKey: r.dedupeKey,
            categoryId:
              csvCategoryOverrides[r.dedupeHash] ?? r.suggestedCategoryId,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mengimpor mutasi BCA.");
        return;
      }

      toast.success(
        `${data.importedCount} transaksi BCA berhasil dicatat${
          data.duplicateCount > 0
            ? ` (${data.duplicateCount} duplikat dilewati)`
            : ""
        }!`
      );
      triggerRefresh();
      await Promise.all([refreshIntegrationState(), handlePreviewCsv(csvText)]);
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#EADBC0] bg-[#FDF8EE] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
            <Landmark className="h-3.5 w-3.5" />
            <span>Otomatisasi Bank BCA · Tanpa Password/PIN BCA</span>
          </div>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight text-[#1C1917]">
            Auto-Catat Transaksi Bank BCA
          </h1>
          <p className="mt-1 text-sm text-[#57534E] max-w-2xl">
            Catat uang masuk dan keluar dari BCA secara otomatis melalui
            notifikasi Email/HP (real-time) atau impor file mutasi CSV KlikBCA /
            myBCA dengan proteksi anti-duplikat.
          </p>
        </div>

        <Link
          href="/transaksi"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14532D] hover:underline underline-offset-4"
        >
          <span>Lihat Buku Transaksi →</span>
        </Link>
      </div>

      {/* Security Trust Callout */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] px-4 py-3.5 text-xs text-[#14532D]">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>100% Aman:</strong> ArusKas tidak pernah meminta Username,
          PIN, atau Password KlikBCA/myBCA Anda. Pencatatan otomatis bekerja
          dengan membaca teks notifikasi transaksi BCA atau file mutasi CSV yang
          Anda kirimkan sendiri.
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E7E2D8] pb-3">
        {(
          [
            {
              key: "webhook",
              label: "Otomatis Real-Time (Notifikasi BCA)",
              icon: Sparkles,
            },
            {
              key: "csv",
              label: "Impor Mutasi CSV (KlikBCA / myBCA)",
              icon: FileSpreadsheet,
            },
            {
              key: "logs",
              label: `Riwayat Sinkronisasi (${logs.length})`,
              icon: History,
            },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
                active
                  ? "bg-[#14532D] text-[#FFFFFF]"
                  : "border border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E] hover:bg-[#EFECE4] hover:text-[#1C1917]"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: REAL-TIME WEBHOOK + SIMULATOR */}
      {tab === "webhook" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Configuration & Token */}
          <div className="lg:col-span-6 space-y-6">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#E7E2D8]">
                <div>
                  <h2 className="text-base font-semibold text-[#1C1917]">
                    1. Hubungkan Dompet BCA &amp; Token Webhook
                  </h2>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    Pilih dompet tujuan untuk semua transaksi masuk/keluar BCA.
                  </p>
                </div>
                {integration ? (
                  <Badge variant={integration.isActive ? "inflow" : "warning"}>
                    {integration.isActive ? "Aktif" : "Dijeda"}
                  </Badge>
                ) : (
                  <Badge variant="neutral">Belum Aktif</Badge>
                )}
              </div>

              <form onSubmit={handleSaveConfig} noValidate className="mt-4 space-y-4">
                <Select
                  label="Dompet Tujuan BCA"
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatIDR(w.balance)})
                    </option>
                  ))}
                </Select>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex items-center gap-2.5 rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] px-3.5 py-2.5 text-xs font-medium text-[#1C1917] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 accent-[#14532D]"
                    />
                    <span>Terima webhook otomatis</span>
                  </label>
                  <label className="flex items-center gap-2.5 rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] px-3.5 py-2.5 text-xs font-medium text-[#1C1917] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoCategorize}
                      onChange={(e) => setAutoCategorize(e.target.checked)}
                      className="h-4 w-4 accent-[#14532D]"
                    />
                    <span>Auto-tebak kategori</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <Button type="submit" loading={savingConfig}>
                    {integration
                      ? "Simpan Pengaturan"
                      : "Aktifkan & Buat Token Webhook"}
                  </Button>
                  {integration && (
                    <Button
                      type="button"
                      variant="secondary"
                      loading={rotatingToken}
                      onClick={handleRotateToken}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Buat Ulang Token</span>
                    </Button>
                  )}
                </div>
              </form>

              {integration && (
                <div className="mt-5 space-y-3 border-t border-[#E7E2D8] pt-4">
                  <div>
                    <p className="text-xs font-medium text-[#78716C]">
                      Endpoint Webhook ArusKas
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-lg border border-[#E7E2D8] bg-[#FAF8F4] px-3 py-2 text-xs text-[#1C1917]">
                        {webhookUrl}
                      </code>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          copyText("url", webhookUrl, "URL Webhook")
                        }
                      >
                        {copiedKey === "url" ? (
                          <Check className="h-3.5 w-3.5 text-[#15803D]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-[#78716C] flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-[#B45309]" />
                      <span>Token Rahasia Webhook</span>
                    </p>
                    {freshRawToken ? (
                      <div className="mt-1.5 space-y-2 rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 p-3">
                        <p className="text-[11px] font-semibold text-[#92400E]">
                          Salin token ini sekarang — demi keamanan token lengkap
                          hanya ditampilkan sekali.
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded-lg border border-[#EADBC0] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-mono text-[#1C1917]">
                            {freshRawToken}
                          </code>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              copyText("token", freshRawToken, "Token Rahasia")
                            }
                          >
                            {copiedKey === "token" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>Salin</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 rounded-lg border border-[#E7E2D8] bg-[#FAF8F4] px-3 py-2 font-mono text-xs text-[#57534E]">
                        {integration.tokenPrefix}{" "}
                        <span className="font-sans text-[#78716C]">
                          (klik &quot;Buat Ulang Token&quot; jika perlu token baru)
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Setup Guide Card */}
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[#1C1917]">
                2. Panduan Otomatisasi (Gratis, 3 Menit)
              </h2>
              <p className="mt-1 text-xs text-[#78716C]">
                Pilih cara pengiriman notifikasi BCA ke ArusKas:
              </p>

              <div className="mt-3 flex gap-1.5">
                {(
                  [
                    { key: "gmail", label: "Gmail (Otomatis)", icon: Mail },
                    { key: "android", label: "Android", icon: Smartphone },
                    { key: "ios", label: "iPhone", icon: Smartphone },
                  ] as const
                ).map((g) => {
                  const Icon = g.icon;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setGuideTab(g.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                        guideTab === g.key
                          ? "bg-[#EFECE4] text-[#14532D] font-semibold"
                          : "text-[#57534E] hover:bg-[#FAF8F4]"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{g.label}</span>
                    </button>
                  );
                })}
              </div>

              {guideTab === "gmail" && (
                <div className="mt-4 space-y-3 text-xs text-[#57534E]">
                  <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                    <li>
                      Pastikan notifikasi email transaksi di <strong>myBCA / m-BCA</strong> aktif menuju Gmail Anda.
                    </li>
                    <li>
                      Buka <strong>script.google.com</strong> → klik{" "}
                      <em>New Project</em> → tempel kode di bawah.
                    </li>
                    <li>
                      Buka menu <strong>Triggers</strong> (ikon jam) → tambah
                      trigger <code>syncNotifikasiBCA</code> berjalan setiap{" "}
                      <strong>5 menit</strong>.
                    </li>
                  </ol>

                  <div className="relative">
                    <pre className="max-h-56 overflow-auto rounded-xl border border-[#245A3E] bg-[#113B26] p-3.5 text-[11px] leading-relaxed text-[#E7F0EB] font-mono">
                      {appsScriptCode}
                    </pre>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        copyText("script", appsScriptCode, "Kode Apps Script")
                      }
                      className="absolute right-2.5 top-2.5 h-7 px-2.5 text-[11px]"
                    >
                      {copiedKey === "script" ? (
                        <Check className="h-3 w-3 text-[#15803D]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>Salin Skrip</span>
                    </Button>
                  </div>
                </div>
              )}

              {guideTab === "android" && (
                <ol className="mt-4 list-decimal pl-4 space-y-2 text-xs text-[#57534E] leading-relaxed">
                  <li>
                    Install aplikasi <strong>MacroDroid</strong> (gratis di Play
                    Store).
                  </li>
                  <li>
                    <strong>Trigger:</strong> <em>Notification Received</em> →
                    pilih aplikasi <strong>myBCA</strong> atau{" "}
                    <strong>BCA mobile</strong>.
                  </li>
                  <li>
                    <strong>Action:</strong> <em>HTTP Request (POST)</em> ke{" "}
                    <code className="text-[#14532D]">{webhookUrl}</code> dengan
                    Header <code>Authorization: Bearer [TOKEN]</code> dan JSON
                    body:{" "}
                    <code>{`{"text":"[not_body]","subject":"[not_title]","source":"webhook_push"}`}</code>
                    .
                  </li>
                </ol>
              )}

              {guideTab === "ios" && (
                <ol className="mt-4 list-decimal pl-4 space-y-2 text-xs text-[#57534E] leading-relaxed">
                  <li>
                    Buka aplikasi <strong>Shortcuts</strong> → tab{" "}
                    <strong>Automation</strong> → buat automasi saat menerima{" "}
                    <strong>Email dari BCA</strong> (atau pakai jalur Gmail Apps
                    Script agar berjalan 100% di latar belakang tanpa konfirmasi
                    iOS).
                  </li>
                  <li>
                    Tambahkan aksi <strong>Get Contents of URL</strong> (Method{" "}
                    <code>POST</code>, Header{" "}
                    <code>Authorization: Bearer [TOKEN]</code>, JSON body berisi{" "}
                    <code>text</code> dan <code>source: &quot;webhook_email&quot;</code>).
                  </li>
                </ol>
              )}
            </Card>
          </div>

          {/* Right: Live Simulator */}
          <div className="lg:col-span-6">
            <Card className="p-5 sm:p-6">
              <div className="pb-4 border-b border-[#E7E2D8]">
                <h2 className="text-base font-semibold text-[#1C1917]">
                  3. Uji Coba Langsung (Tempel Notifikasi BCA)
                </h2>
                <p className="text-xs text-[#78716C] mt-0.5">
                  Coba tempel teks email/notifikasi myBCA atau klik contoh di
                  bawah untuk langsung menguji pencatatan otomatis ke dompet
                  BCA Anda.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {SAMPLE_NOTIFICATIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => {
                      setSimSubject(s.subject);
                      setSimText(s.text);
                      setSimPreview(null);
                    }}
                    className="rounded-full border border-[#DDD5C7] bg-[#FAF8F4] px-3 py-1 text-xs font-medium text-[#57534E] hover:border-[#14532D] hover:text-[#14532D] transition-colors cursor-pointer"
                  >
                    Contoh: {s.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#57534E] mb-1">
                    Subjek Notifikasi (Opsional)
                  </label>
                  <input
                    type="text"
                    value={simSubject}
                    onChange={(e) => setSimSubject(e.target.value)}
                    placeholder="Contoh: Notifikasi Transfer Masuk myBCA"
                    className="h-10 w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                  />
                </div>

                <Textarea
                  label="Isi Teks Notifikasi / Email BCA"
                  rows={4}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="Tempel teks notifikasi myBCA / m-BCA di sini..."
                />

                <div className="flex flex-wrap gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={simBusy}
                    onClick={() => runSimulator(false)}
                  >
                    <span>Uji Baca (Pratinjau)</span>
                  </Button>
                  <Button
                    type="button"
                    loading={simBusy}
                    onClick={() => runSimulator(true)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Catat Otomatis ke Dompet</span>
                  </Button>
                </div>
              </div>

              {simPreview && (
                <div className="mt-5 rounded-xl border border-[#CBE0D2] bg-[#F2FAF5] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14532D]">
                      <CheckCircle2 className="h-4 w-4" />
                      Hasil Pembacaan Otomatis
                    </span>
                    <Badge
                      variant={
                        simPreview.type === "income" ? "inflow" : "outflow"
                      }
                    >
                      {simPreview.type === "income"
                        ? "Uang Masuk"
                        : "Uang Keluar"}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-[#1C1917]">
                    {simPreview.title}
                  </p>
                  <p
                    className={cn(
                      "font-display tnum text-2xl font-medium",
                      simPreview.type === "income"
                        ? "text-[#15803D]"
                        : "text-[#B91C1C]"
                    )}
                  >
                    {formatIDR(
                      simPreview.type === "income"
                        ? simPreview.amount
                        : -simPreview.amount,
                      { signed: true }
                    )}
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#CBE0D2]/80 text-xs text-[#57534E]">
                    <div>
                      <span className="text-[#78716C] block text-[11px]">
                        Tanggal
                      </span>
                      <span className="tnum font-medium text-[#1C1917]">
                        {formatDateID(simPreview.occurredAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#78716C] block text-[11px]">
                        Kategori Otomatis
                      </span>
                      <span className="font-medium text-[#1C1917]">
                        {simPreview.suggestedCategoryName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#78716C] block text-[11px]">
                        Metode
                      </span>
                      <span className="font-medium text-[#1C1917]">
                        {simPreview.paymentMethod}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: CSV IMPORT KLIKBCA / MYBCA */}
      {tab === "csv" && (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1 max-w-md">
                <Select
                  label="Pilih Dompet BCA Tujuan Impor"
                  value={csvWalletId}
                  onChange={(e) => setCsvWalletId(e.target.value)}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatIDR(w.balance)})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] hover:bg-[#166534] transition-colors cursor-pointer">
                  <Upload className="h-4 w-4" />
                  <span>Upload CSV Mutasi BCA</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFileUpload}
                    className="hidden"
                  />
                </label>

                <Button
                  type="button"
                  variant="secondary"
                  loading={csvBusy}
                  onClick={() => {
                    setCsvText(SAMPLE_BCA_CSV);
                    void handlePreviewCsv(SAMPLE_BCA_CSV);
                  }}
                >
                  <span>Muat Contoh Mutasi KlikBCA</span>
                </Button>
              </div>
            </div>

            {csvMeta && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] px-4 py-2.5 text-xs text-[#57534E]">
                {csvMeta.detectedPeriod && (
                  <span>
                    Periode: <strong className="text-[#1C1917]">{csvMeta.detectedPeriod}</strong>
                  </span>
                )}
                <span>
                  Terbaca: <strong className="tnum text-[#1C1917]">{csvPreviewRows.length}</strong> baris
                </span>
                {csvMeta.skippedPending > 0 && (
                  <span className="text-[#B45309]">
                    {csvMeta.skippedPending} baris PEND dilewati otomatis
                  </span>
                )}
              </div>
            )}

            {csvPreviewRows.length > 0 && (
              <div className="mt-5 space-y-4">
                <div className="overflow-x-auto rounded-xl border border-[#E7E2D8]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF8F4] border-b border-[#E7E2D8] text-[#78716C]">
                      <tr>
                        <th className="px-3 py-2.5 w-9">Pilih</th>
                        <th className="px-3 py-2.5">Tanggal</th>
                        <th className="px-3 py-2.5">Keterangan</th>
                        <th className="px-3 py-2.5">Kategori</th>
                        <th className="px-3 py-2.5 text-right">Nominal</th>
                        <th className="px-3 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE4]">
                      {csvPreviewRows.map((row) => {
                        const checked = csvSelectedHashes.has(row.dedupeHash);
                        const matchingCats = csvCategories.filter(
                          (c) => c.type === row.type
                        );
                        return (
                          <tr
                            key={row.dedupeHash}
                            className={row.isDuplicate ? "bg-[#FAF8F4]/70 opacity-70" : "bg-[#FFFFFF]"}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                disabled={row.isDuplicate}
                                checked={checked}
                                onChange={(e) => {
                                  const next = new Set(csvSelectedHashes);
                                  if (e.target.checked) next.add(row.dedupeHash);
                                  else next.delete(row.dedupeHash);
                                  setCsvSelectedHashes(next);
                                }}
                                className="h-4 w-4 accent-[#14532D]"
                              />
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap tnum text-[#57534E]">
                              {formatDateID(row.occurredAt)}
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-[#1C1917]">
                                {row.title}
                              </p>
                              <p className="text-[11px] text-[#78716C]">
                                {row.paymentMethod}
                              </p>
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                disabled={row.isDuplicate}
                                value={
                                  csvCategoryOverrides[row.dedupeHash] ??
                                  row.suggestedCategoryId
                                }
                                onChange={(e) =>
                                  setCsvCategoryOverrides((prev) => ({
                                    ...prev,
                                    [row.dedupeHash]: e.target.value,
                                  }))
                                }
                                className="h-8 rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] px-2 text-xs text-[#1C1917]"
                              >
                                {matchingCats.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2.5 text-right whitespace-nowrap font-semibold tnum",
                                row.type === "income"
                                  ? "text-[#15803D]"
                                  : "text-[#B91C1C]"
                              )}
                            >
                              {formatIDR(
                                row.type === "income"
                                  ? row.amount
                                  : -row.amount,
                                { signed: true }
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              {row.isDuplicate ? (
                                <Badge variant="warning">Duplikat</Badge>
                              ) : (
                                <Badge variant="inflow">Baru</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#57534E]">
                    <strong className="tnum text-[#1C1917]">
                      {csvSelectedHashes.size}
                    </strong>{" "}
                    transaksi baru siap diimpor ke dompet BCA.
                  </p>
                  <Button
                    type="button"
                    loading={csvBusy}
                    disabled={csvSelectedHashes.size === 0}
                    onClick={handleCommitCsv}
                  >
                    <span>Impor {csvSelectedHashes.size} Transaksi Terpilih</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: SYNC LOGS */}
      {tab === "logs" && (
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#E7E2D8]">
            <div>
              <h2 className="text-base font-semibold text-[#1C1917]">
                Riwayat Sinkronisasi Otomatis &amp; Impor BCA
              </h2>
              <p className="text-xs text-[#78716C] mt-0.5">
                Menampilkan 25 aktivitas terakhir dari Webhook Email, Push HP,
                Simulator, dan Impor CSV.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={refreshIntegrationState}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Segarkan</span>
            </Button>
          </div>

          {logs.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<History className="h-5 w-5" />}
                title="Belum ada riwayat sinkronisasi BCA"
                description="Coba jalankan Simulator Notifikasi atau Impor CSV Mutasi BCA untuk melihat catatan otomatis muncul di sini."
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#EFECE4]">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          log.status === "imported"
                            ? "inflow"
                            : log.status === "duplicate"
                              ? "warning"
                              : "outflow"
                        }
                      >
                        {log.status === "imported"
                          ? "Tercatat"
                          : log.status === "duplicate"
                            ? "Duplikat Dilewati"
                            : "Gagal"}
                      </Badge>
                      <span className="text-xs font-medium text-[#1C1917]">
                        {log.walletName}
                      </span>
                      <span className="text-[11px] text-[#78716C]">
                        ·{" "}
                        {log.source === "webhook_email"
                          ? "Webhook Email"
                          : log.source === "webhook_push"
                            ? "Webhook HP"
                            : log.source === "csv_import"
                              ? "Impor CSV"
                              : "Simulator"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[#57534E]">
                      {log.rawSnippet}
                    </p>
                    {log.errorMessage && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#B91C1C]">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>{log.errorMessage}</span>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-[#78716C] tnum">
                    {formatDateID(log.createdAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
