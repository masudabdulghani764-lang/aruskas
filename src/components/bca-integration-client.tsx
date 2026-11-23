"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
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
} from "lucide-react";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import { CsvImportPanel } from "@/components/integration/csv-import-panel";
import { NativeAutoCatatCard } from "@/components/integration/native-auto-catat-card";
import {
  buildGmailAppsScript,
  PROVIDER_META,
  SAMPLE_NOTIFICATIONS,
} from "@/components/integration/provider-meta";
import { SyncLogsPanel } from "@/components/integration/sync-logs-panel";
import {
  Badge,
  Button,
  Card,
  Select,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import {
  checkAndroidAppUpdate,
  type AndroidAutoCatatStatus,
} from "@/lib/app-version";
import { SUPPORTED_BANK_PROVIDERS } from "@/lib/bank-notification-parser";
import type {
  BcaIntegrationView,
  BcaSyncLogView,
} from "@/lib/bca-integration";
import { formatDateID, formatIDR } from "@/lib/format";
import type { WalletWithRole } from "@/lib/wallets";

type ActiveTab = "webhook" | "csv" | "logs";
type GuideTab = "gmail" | "android" | "ios";

/**
 * Modular Bank & E-Wallet Auto-Catat hub with 3-step onboarding indicator,
 * per-provider wallet routing, native Android APK listener bridge,
 * Gmail/Shortcuts webhooks, CSV import, and live notification simulator.
 */
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
  const [selectedProviderId, setSelectedProviderId] = useState<string>("all");
  const [origin, setOrigin] = useState("http://localhost:3000");

  const activeProvider = useMemo(
    () =>
      SUPPORTED_BANK_PROVIDERS.find((p) => p.id === selectedProviderId) ?? null,
    [selectedProviderId]
  );
  const activeProviderMeta = activeProvider
    ? PROVIDER_META[activeProvider.id]
    : null;

  const [integration, setIntegration] = useState<BcaIntegrationView | null>(
    initialIntegration
  );
  const [logs, setLogs] = useState<BcaSyncLogView[]>(initialLogs);
  const [wallets] = useState<WalletWithRole[]>(initialWallets);

  const defaultWalletId = useMemo(() => {
    if (initialIntegration?.walletId) return initialIntegration.walletId;
    return initialWallets[0]?.id ?? "";
  }, [initialIntegration, initialWallets]);

  const [selectedWalletId, setSelectedWalletId] = useState(defaultWalletId);
  const [isActive, setIsActive] = useState(initialIntegration?.isActive ?? true);
  const [autoCategorize, setAutoCategorize] = useState(
    initialIntegration?.autoCategorize ?? true
  );
  const [providerWalletMap, setProviderWalletMap] = useState<
    Record<string, string>
  >(initialIntegration?.providerWalletMap ?? {});
  const [showRoutingPanel, setShowRoutingPanel] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [freshRawToken, setFreshRawToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Native Android APK Auto-Catat state
  const [isAndroidApk, setIsAndroidApk] = useState(false);
  const [apkNeedsUpdate, setApkNeedsUpdate] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<AndroidAutoCatatStatus | null>(
    null
  );
  const [nativeBusy, setNativeBusy] = useState(false);
  const [canPickInstalledApps, setCanPickInstalledApps] = useState(false);

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
    providerName?: string;
  } | null>(null);

  const refreshNativeStatus = useCallback(() => {
    try {
      const bridge = window.ArusKasNative;
      if (bridge?.isAutoCatatSupported?.() && bridge.getAutoCatatStatusJson) {
        const parsed = JSON.parse(
          bridge.getAutoCatatStatusJson()
        ) as AndroidAutoCatatStatus;
        if (parsed && parsed.supported) {
          setNativeStatus(parsed);
          setCanPickInstalledApps(Boolean(bridge.getInstalledAppsJson));
        }
      }
    } catch {
      // ignore outside native shell
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    const uaInfo = checkAndroidAppUpdate(window.navigator.userAgent ?? "");
    if (
      uaInfo.isAndroidApk ||
      /Android/i.test(window.navigator.userAgent ?? "")
    ) {
      setGuideTab("android");
    }
    setIsAndroidApk(uaInfo.isAndroidApk);
    setApkNeedsUpdate(uaInfo.needsUpdate);
    refreshNativeStatus();

    const handleResume = () => {
      if (document.visibilityState === "visible") {
        refreshNativeStatus();
      }
    };
    window.addEventListener("focus", refreshNativeStatus);
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      window.removeEventListener("focus", refreshNativeStatus);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [refreshNativeStatus]);

  const webhookUrl = `${origin}/api/integrations/bca/webhook`;
  const tokenForGuide =
    freshRawToken ?? integration?.tokenPrefix ?? "TEMPATKAN_TOKEN_WEBHOOK_ANDA";
  const appsScriptCode = useMemo(
    () => buildGmailAppsScript(webhookUrl, tokenForGuide, selectedProviderId),
    [webhookUrl, tokenForGuide, selectedProviderId]
  );

  function handleSelectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    const meta = PROVIDER_META[providerId];
    if (meta) {
      setSimSubject(meta.sampleSubject);
      setSimText(meta.sampleText);
      setSimPreview(null);
    }
  }

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
      toast.error("Pilih dompet tujuan default terlebih dahulu.");
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
          providerWalletMap,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menyimpan pengaturan Auto Bank.");
        return;
      }
      setIntegration(data.integration);
      if (data.rawToken) {
        setFreshRawToken(data.rawToken);
        toast.success(
          "Otomatisasi Bank & E-Wallet aktif! Segera salin Token Rahasia Anda di bawah."
        );
      } else {
        toast.success("Pengaturan otomatisasi Bank & E-Wallet disimpan.");
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
      if (
        data.rawToken &&
        window.ArusKasNative?.isAutoCatatSupported?.() &&
        window.ArusKasNative?.hasAutoCatatToken?.()
      ) {
        const keepEnabled = Boolean(
          window.ArusKasNative?.isAutoCatatEnabled?.()
        );
        window.ArusKasNative.configureAutoCatat?.(data.rawToken, keepEnabled);
        refreshNativeStatus();
        toast.success(
          "Token baru dibuat & otomatis disinkronkan ke Auto-Catat Android."
        );
      } else {
        toast.success(
          "Token webhook baru dibuat. Token lama otomatis tidak berlaku."
        );
      }
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setRotatingToken(false);
    }
  }

  async function handleConnectNativeAutoCatat() {
    const bridge = window.ArusKasNative;
    if (!bridge?.isAutoCatatSupported?.()) {
      toast.error("Fitur ini hanya tersedia di APK ArusKas v1.0.7 ke atas.");
      return;
    }
    if (!selectedWalletId) {
      toast.error("Pilih dompet tujuan default terlebih dahulu.");
      return;
    }

    setNativeBusy(true);
    try {
      let tokenToUse = freshRawToken;

      if (!integration) {
        const createRes = await fetch("/api/integrations/bca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId: selectedWalletId,
            isActive: true,
            autoCategorize,
            providerWalletMap,
          }),
        });
        const createData = await createRes.json().catch(() => ({}));
        if (!createRes.ok) {
          toast.error(
            createData.error ?? "Gagal mengaktifkan integrasi server."
          );
          return;
        }
        setIntegration(createData.integration);
        setIsActive(true);
        if (createData.rawToken) {
          tokenToUse = createData.rawToken;
          setFreshRawToken(createData.rawToken);
        }
      } else if (!integration.isActive) {
        await fetch("/api/integrations/bca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId: selectedWalletId,
            isActive: true,
            autoCategorize,
            providerWalletMap,
          }),
        });
        setIsActive(true);
      }

      if (!tokenToUse) {
        const rotRes = await fetch("/api/integrations/bca/rotate-token", {
          method: "POST",
        });
        const rotData = await rotRes.json().catch(() => ({}));
        if (!rotRes.ok || !rotData.rawToken) {
          toast.error(
            rotData.error ??
              "Gagal membuat token otomatis untuk aplikasi Android."
          );
          return;
        }
        setIntegration(rotData.integration);
        setFreshRawToken(rotData.rawToken);
        tokenToUse = rotData.rawToken;
      }

      const saved = bridge.configureAutoCatat?.(tokenToUse ?? "", true);
      if (!saved) {
        toast.error("Gagal menyimpan konfigurasi ke aplikasi Android.");
        return;
      }

      refreshNativeStatus();
      if (!bridge.isNotificationAccessGranted?.()) {
        toast.success(
          "Token terhubung! Sekarang ketuk 'Buka Izin Notifikasi' lalu aktifkan Auto-Catat ArusKas."
        );
      } else {
        toast.success(
          "Auto-Catat Bawaan Aktif! Semua notifikasi bank & e-wallet kini otomatis tercatat."
        );
      }
    } catch {
      toast.error("Terjadi gangguan jaringan saat menghubungkan Auto-Catat.");
    } finally {
      setNativeBusy(false);
    }
  }

  function handleToggleNativeAutoCatat(nextEnabled: boolean) {
    const bridge = window.ArusKasNative;
    if (!bridge?.setAutoCatatEnabled) return;
    if (nextEnabled && !bridge.hasAutoCatatToken?.()) {
      void handleConnectNativeAutoCatat();
      return;
    }
    const ok = bridge.setAutoCatatEnabled(nextEnabled);
    refreshNativeStatus();
    if (ok) {
      toast.success(
        nextEnabled
          ? "Auto-Catat Notifikasi Bank diaktifkan."
          : "Auto-Catat Notifikasi Bank dijeda sementara."
      );
    }
  }

  function handleToggleIncludeExtraApps(nextVal: boolean) {
    const bridge = window.ArusKasNative;
    if (!bridge?.setIncludeExtraAppsEnabled) return;
    bridge.setIncludeExtraAppsEnabled(nextVal);
    refreshNativeStatus();
    toast.success(
      nextVal
        ? "Pemantauan notifikasi WhatsApp / Email / SMS diaktifkan."
        : "Kembali memantau aplikasi Bank & E-Wallet saja."
    );
  }

  async function runSimulator(commit: boolean) {
    if (!selectedWalletId) {
      toast.error("Pilih dompet tujuan terlebih dahulu.");
      return;
    }
    if (!simText.trim()) {
      toast.error("Tempel teks notifikasi bank atau e-wallet terlebih dahulu.");
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
        toast.error(data.error ?? "Gagal membaca notifikasi transaksi.");
        return;
      }

      setSimPreview({
        type: data.parsed.type,
        amount: data.parsed.amount,
        title: data.parsed.title,
        occurredAt: data.parsed.occurredAt,
        paymentMethod: data.parsed.paymentMethod,
        suggestedCategoryName: data.suggestedCategoryName,
        providerName: data.parsed.providerName,
      });

      if (commit) {
        if (data.result?.status === "duplicate") {
          toast.warning(data.result.message);
        } else {
          toast.success(
            `Berhasil dicatat otomatis (${formatIDR(data.parsed.amount)})!`
          );
          triggerRefresh();
        }
        await refreshIntegrationState();
      } else {
        toast.success("Notifikasi berhasil dibaca — cek hasil pratinjau.");
      }
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setSimBusy(false);
    }
  }

  const step1Done = Boolean(integration?.isActive);
  const step2Done = Boolean(
    (nativeStatus?.supported &&
      nativeStatus.enabled &&
      nativeStatus.notificationAccess &&
      nativeStatus.hasToken) ||
      logs.some((l) => l.source === "webhook_email" || l.source === "webhook_push")
  );
  const step3Done = logs.some((l) => l.status === "imported");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#EADBC0] bg-[#FDF8EE] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
            <Landmark className="h-3.5 w-3.5" />
            <span>
              Otomatisasi 12 Bank &amp; E-Wallet Indonesia · Tanpa Password/PIN
            </span>
          </div>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-tight text-[#1C1917]">
            {activeProvider
              ? `Auto-Catat Transaksi ${activeProvider.label}`
              : "Auto-Catat Bank & E-Wallet"}
          </h1>
          <p className="mt-1 text-sm text-[#57534E] max-w-2xl">
            {activeProvider
              ? `Hubungkan notifikasi ${activeProvider.label} ke dompet pilihan Anda secara otomatis, lengkap dengan anti-duplikat dan tebak kategori.`
              : "Pilih bank atau e-wallet yang Anda gunakan di bawah ini — panduan, routing dompet, dan contoh uji coba langsung menyesuaikan pilihan Anda."}
          </p>
          <div
            role="group"
            aria-label="Pilih Bank atau E-Wallet"
            className="mt-3 flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              onClick={() => handleSelectProvider("all")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                selectedProviderId === "all"
                  ? "border-[#14532D] bg-[#14532D] text-[#FFFFFF]"
                  : "border-[#E3D4BA] bg-[#FFFFFF] text-[#57534E] hover:bg-[#FAF1E0]"
              )}
            >
              Semua Bank &amp; E-Wallet (12)
            </button>
            {SUPPORTED_BANK_PROVIDERS.map((p) => {
              const isSelected = selectedProviderId === p.id;
              const isMapped = Boolean(providerWalletMap[p.id]);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectProvider(p.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    isSelected
                      ? "border-[#14532D] bg-[#14532D] text-[#FFFFFF] font-semibold"
                      : p.kind === "ewallet"
                        ? "border-[#CBE0D2] bg-[#EFF6F1] text-[#14532D] hover:bg-[#DCFCE7]"
                        : "border-[#E3D4BA] bg-[#FAF1E0] text-[#57534E] hover:bg-[#F3E2C5]"
                  )}
                >
                  <span>{p.label}</span>
                  {isMapped && (
                    <span
                      title="Sudah dipetakan ke dompet khusus"
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isSelected ? "bg-[#86EFAC]" : "bg-[#15803D]"
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Link
          href="/transaksi"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14532D] hover:underline underline-offset-4"
        >
          <span>Lihat Buku Transaksi →</span>
        </Link>
      </div>

      {/* Onboarding Progress Stepper */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[
          {
            step: 1,
            title: "Hubungkan Dompet",
            desc: step1Done
              ? `Aktif → ${integration?.walletName ?? "Siap"}`
              : "Pilih dompet default & simpan",
            done: step1Done,
          },
          {
            step: 2,
            title: "Aktifkan Jalur Notifikasi",
            desc: step2Done
              ? "Izin HP / webhook terhubung"
              : "Pakai APK Android 1-klik atau Gmail",
            done: step2Done,
          },
          {
            step: 3,
            title: "Transaksi Masuk Otomatis",
            desc: step3Done
              ? `${logs.filter((l) => l.status === "imported").length} transaksi berhasil tercatat`
              : "Coba tes di Simulator atau tunggu notif",
            done: step3Done,
          },
        ].map((item) => (
          <div
            key={item.step}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-xs transition-colors",
              item.done
                ? "border-[#BBF7D0] bg-[#EFF6F1]"
                : "border-[#E7E2D8] bg-[#FFFFFF]"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                item.done
                  ? "bg-[#14532D] text-[#FFFFFF]"
                  : "bg-[#EFECE4] text-[#57534E]"
              )}
            >
              {item.done ? "✓" : item.step}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[#1C1917] truncate">
                {item.title}
              </p>
              <p className="text-[11px] text-[#78716C] truncate">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Security Trust Callout */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] px-4 py-3.5 text-xs text-[#14532D]">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>100% Aman:</strong> ArusKas tidak pernah meminta Username,
          PIN, atau Password mobile banking / e-wallet Anda. Pencatatan otomatis
          bekerja dengan membaca teks notifikasi dari aplikasi bank/e-wallet
          pilihan Anda atau file mutasi CSV yang Anda kirimkan sendiri.
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E7E2D8] pb-3">
        {(
          [
            {
              key: "webhook",
              label: "Otomatis Real-Time (Bank & E-Wallet)",
              icon: Sparkles,
            },
            {
              key: "csv",
              label: "Impor Mutasi CSV Bank",
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
          {/* Left: Configuration & Guides */}
          <div className="lg:col-span-6 space-y-6">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#E7E2D8]">
                <div>
                  <h2 className="text-base font-semibold text-[#1C1917]">
                    1. Hubungkan Dompet Tujuan &amp; Token Webhook
                  </h2>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    Pilih dompet default dan (opsional) petakan dompet khusus
                    per bank atau e-wallet.
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

              <form
                onSubmit={handleSaveConfig}
                noValidate
                className="mt-4 space-y-4"
              >
                {activeProvider && (
                  <div className="rounded-xl border border-[#CBE0D2] bg-[#EFF6F1] p-3.5 space-y-2">
                    <Select
                      label={`Dompet Khusus untuk ${activeProvider.label}`}
                      value={providerWalletMap[activeProvider.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProviderWalletMap((prev) => {
                          const next = { ...prev };
                          if (val) next[activeProvider.id] = val;
                          else delete next[activeProvider.id];
                          return next;
                        });
                      }}
                    >
                      <option value="">Ikuti Dompet Tujuan Default</option>
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({formatIDR(w.balance)})
                        </option>
                      ))}
                    </Select>
                    <p className="text-[11px] text-[#14532D]">
                      Setiap notifikasi dari{" "}
                      <strong>{activeProvider.label}</strong> akan otomatis
                      dicatat ke dompet ini setelah Anda klik Simpan.
                    </p>
                  </div>
                )}

                <Select
                  label="Dompet Tujuan Default (Semua Bank & E-Wallet)"
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatIDR(w.balance)})
                    </option>
                  ))}
                </Select>

                {/* Per-Provider Wallet Routing */}
                <div className="rounded-xl border border-[#E3D4BA] bg-[#FAF1E0]/55 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-[#1C1917]">
                        Routing Dompet Per Bank / E-Wallet (Opsional)
                      </p>
                      <p className="text-[11px] text-[#78716C]">
                        Misal: notif GoPay otomatis masuk ke Dompet GoPay,
                        SeaBank ke Dompet SeaBank.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowRoutingPanel((prev) => !prev)}
                      className="shrink-0 rounded-lg border border-[#E3D4BA] bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-semibold text-[#14532D] hover:bg-[#EFECE4] cursor-pointer"
                    >
                      {showRoutingPanel ? "Tutup" : "Atur Routing"}
                    </button>
                  </div>

                  {showRoutingPanel && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1 max-h-60 overflow-y-auto pr-1">
                      {SUPPORTED_BANK_PROVIDERS.map((prov) => (
                        <div
                          key={prov.id}
                          className="flex flex-col gap-1 rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] p-2"
                        >
                          <span className="text-[11px] font-semibold text-[#1C1917]">
                            {prov.label}
                          </span>
                          <select
                            value={providerWalletMap[prov.id] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setProviderWalletMap((prev) => {
                                const next = { ...prev };
                                if (val) next[prov.id] = val;
                                else delete next[prov.id];
                                return next;
                              });
                            }}
                            className="h-8 rounded-md border border-[#E7E2D8] bg-[#FAF8F4] px-2 text-xs text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                          >
                            <option value="">Ikuti Dompet Default</option>
                            {wallets.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
                          (klik &quot;Buat Ulang Token&quot; jika perlu token
                          baru)
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
                2. Panduan Otomatisasi{" "}
                {activeProvider ? activeProvider.label : "(Gratis, 3 Menit)"}
              </h2>
              <p className="mt-1 text-xs text-[#78716C]">
                Pilih cara pengiriman notifikasi{" "}
                {activeProvider ? activeProvider.label : "Bank & E-Wallet"} ke
                ArusKas:
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
                      Pastikan notifikasi email transaksi dari{" "}
                      <strong>
                        {activeProviderMeta
                          ? activeProviderMeta.appName
                          : "bank/e-wallet Anda (Mandiri, BRI, BNI, SeaBank, Jago, GoPay, OVO, DANA, ShopeePay, BCA, dll.)"}
                      </strong>{" "}
                      aktif menuju Gmail Anda.
                    </li>
                    <li>
                      Buka <strong>script.google.com</strong> → klik{" "}
                      <em>New Project</em> → tempel kode di bawah.
                    </li>
                    <li>
                      Buka menu <strong>Triggers</strong> (ikon jam) → tambah
                      trigger <code>syncNotifikasiKeuangan</code> berjalan setiap{" "}
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
                <div className="mt-4 space-y-4">
                  <NativeAutoCatatCard
                    nativeStatus={nativeStatus}
                    nativeBusy={nativeBusy}
                    isAndroidApk={isAndroidApk}
                    apkNeedsUpdate={apkNeedsUpdate}
                    canPickInstalledApps={canPickInstalledApps}
                    onConnect={handleConnectNativeAutoCatat}
                    onToggleEnabled={handleToggleNativeAutoCatat}
                    onToggleIncludeExtra={handleToggleIncludeExtraApps}
                    onRefreshNativeStatus={refreshNativeStatus}
                  />

                  <details className="rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] px-3.5 py-2.5 text-xs text-[#57534E]">
                    <summary className="font-semibold text-[#44403C] cursor-pointer">
                      Opsi Alternatif: Cara Manual via MacroDroid / Notify2HTTP
                    </summary>
                    <ol className="mt-3 list-decimal pl-4 space-y-2 leading-relaxed">
                      <li>
                        Install <strong>MacroDroid</strong> atau{" "}
                        <strong>Notification Forwarder</strong> dari Play Store
                        dan aktifkan <strong>Akses Notifikasi</strong>.
                      </li>
                      <li>
                        <strong>Trigger:</strong> <em>Notification Received</em>{" "}
                        → pilih aplikasi{" "}
                        <strong>
                          {activeProviderMeta
                            ? activeProviderMeta.appName
                            : "bank/e-wallet yang Anda pakai"}
                        </strong>
                        .
                      </li>
                      <li>
                        <strong>Action:</strong> <em>HTTP Request (POST)</em> ke{" "}
                        <code className="text-[#14532D]">{webhookUrl}</code>{" "}
                        dengan Header <code>Authorization: Bearer [TOKEN]</code>.
                      </li>
                      <li>
                        <strong>Content Body:</strong> pilih Content Type{" "}
                        <code>text/plain</code> lalu gunakan tombol Magic Text (
                        <code>...</code>) → pilih{" "}
                        <strong>Judul Notifikasi</strong> dan{" "}
                        <strong>Teks Notifikasi</strong>.
                      </li>
                    </ol>
                  </details>
                </div>
              )}

              {guideTab === "ios" && (
                <ol className="mt-4 list-decimal pl-4 space-y-2 text-xs text-[#57534E] leading-relaxed">
                  <li>
                    Buka aplikasi <strong>Shortcuts</strong> → tab{" "}
                    <strong>Automation</strong> → buat automasi saat menerima{" "}
                    <strong>
                      Email dari{" "}
                      {activeProvider
                        ? activeProvider.label
                        : "Bank / E-Wallet Anda"}
                    </strong>{" "}
                    (atau pakai jalur Gmail Apps Script agar berjalan 100% di
                    latar belakang tanpa konfirmasi iOS).
                  </li>
                  <li>
                    Tambahkan aksi <strong>Get Contents of URL</strong> (Method{" "}
                    <code>POST</code>, Header{" "}
                    <code>Authorization: Bearer [TOKEN]</code>, JSON body berisi{" "}
                    <code>text</code> dan{" "}
                    <code>source: &quot;webhook_email&quot;</code>).
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
                  3. Uji Coba Langsung{" "}
                  {activeProvider
                    ? `(Notifikasi ${activeProvider.label})`
                    : "(Tempel Notifikasi Bank / E-Wallet)"}
                </h2>
                <p className="text-xs text-[#78716C] mt-0.5">
                  Tempel teks email atau notifikasi push dari{" "}
                  {activeProvider
                    ? activeProvider.label
                    : "bank atau e-wallet pilihan Anda"}
                  , atau klik contoh di bawah untuk langsung menguji pembacaan
                  &amp; routing dompet otomatis.
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
                    placeholder="Contoh: Notifikasi GoPay / Livin' Mandiri / SeaBank"
                    className="h-10 w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                  />
                </div>

                <Textarea
                  label="Isi Teks Notifikasi / Email Bank atau E-Wallet"
                  rows={4}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="Tempel teks notifikasi myBCA, Livin' Mandiri, BRImo, SeaBank, Jago, GoPay, ShopeePay, OVO, atau DANA di sini..."
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
                      {simPreview.providerName
                        ? ` · ${simPreview.providerName}`
                        : ""}
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

      {/* TAB 2: CSV IMPORT MUTASI BANK */}
      {tab === "csv" && (
        <CsvImportPanel
          wallets={wallets}
          defaultWalletId={defaultWalletId}
          onImported={async () => {
            triggerRefresh();
            await refreshIntegrationState();
          }}
        />
      )}

      {/* TAB 3: SYNC LOGS */}
      {tab === "logs" && (
        <SyncLogsPanel logs={logs} onRefresh={refreshIntegrationState} />
      )}
    </div>
  );
}
