"use client";

import React, { useMemo, useState } from "react";
import {
  BellRing,
  Download,
  ListChecks,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Input, Modal } from "@/components/ui/primitives";
import {
  LATEST_ANDROID_APP_RELEASE,
  type AndroidAutoCatatStatus,
  type AndroidInstalledApp,
} from "@/lib/app-version";

export function NativeAutoCatatCard({
  nativeStatus,
  nativeBusy,
  isAndroidApk,
  apkNeedsUpdate,
  canPickInstalledApps,
  onConnect,
  onToggleEnabled,
  onToggleIncludeExtra,
  onRefreshNativeStatus,
}: {
  nativeStatus: AndroidAutoCatatStatus | null;
  nativeBusy: boolean;
  isAndroidApk: boolean;
  apkNeedsUpdate: boolean;
  canPickInstalledApps: boolean;
  onConnect: () => Promise<void>;
  onToggleEnabled: (nextEnabled: boolean) => void;
  onToggleIncludeExtra: (nextVal: boolean) => void;
  onRefreshNativeStatus: () => void;
}) {
  const [appPickerOpen, setAppPickerOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<AndroidInstalledApp[]>([]);
  const [appSearch, setAppSearch] = useState("");

  function handleOpenAppPicker() {
    const bridge = window.ArusKasNative;
    if (!bridge?.getInstalledAppsJson) {
      toast.error(
        `Update APK ke v${LATEST_ANDROID_APP_RELEASE.versionName} untuk memilih aplikasi langsung dari HP Anda.`
      );
      return;
    }
    try {
      const parsed = JSON.parse(bridge.getInstalledAppsJson()) as {
        apps?: AndroidInstalledApp[];
      };
      const list = Array.isArray(parsed.apps) ? parsed.apps : [];
      setInstalledApps(list);
      setAppSearch("");
      setAppPickerOpen(true);
    } catch {
      toast.error("Gagal membaca daftar aplikasi terpasang di HP.");
    }
  }

  function handleToggleAppInPicker(packageName: string) {
    setInstalledApps((prev) =>
      prev.map((app) =>
        app.packageName === packageName
          ? { ...app, selected: !app.selected }
          : app
      )
    );
  }

  function handleSelectRecommendedAppsOnly() {
    setInstalledApps((prev) =>
      prev.map((app) => ({
        ...app,
        selected: app.isRecommended,
      }))
    );
    toast.success("Menandai aplikasi bank & e-wallet yang direkomendasikan.");
  }

  function handleSaveAppPicker() {
    const bridge = window.ArusKasNative;
    if (!bridge?.setSelectedAppsJson) return;

    const selectedMap: Record<string, string> = {};
    for (const app of installedApps) {
      if (app.selected) {
        selectedMap[app.packageName] = app.label;
      }
    }

    const count = Object.keys(selectedMap).length;
    if (count === 0) {
      toast.error("Pilih minimal 1 aplikasi untuk dipantau notifikasinya.");
      return;
    }

    const ok = bridge.setSelectedAppsJson(JSON.stringify(selectedMap));
    if (ok) {
      onRefreshNativeStatus();
      setAppPickerOpen(false);
      toast.success(
        `Berhasil! Hanya notifikasi dari ${count} aplikasi pilihan Anda yang dipantau.`
      );
    } else {
      toast.error("Gagal menyimpan daftar aplikasi pilihan.");
    }
  }

  function handleResetAppsDefault() {
    const bridge = window.ArusKasNative;
    if (!bridge?.resetSelectedAppsDefault) return;
    if (bridge.resetSelectedAppsDefault()) {
      onRefreshNativeStatus();
      setAppPickerOpen(false);
      toast.success(
        "Dikembalikan ke daftar default Bank & E-Wallet Indonesia (tanpa promo super-app)."
      );
    }
  }

  const filteredInstalledApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return installedApps;
    return installedApps.filter(
      (app) =>
        app.label.toLowerCase().includes(q) ||
        app.packageName.toLowerCase().includes(q)
    );
  }, [installedApps, appSearch]);

  const selectedPickerCount = useMemo(
    () => installedApps.filter((app) => app.selected).length,
    [installedApps]
  );

  if (!nativeStatus?.supported) {
    if (isAndroidApk && apkNeedsUpdate) {
      return (
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7]/60 p-4 space-y-2.5 text-xs">
          <p className="font-semibold text-[#92400E]">
            Update APK ke v{LATEST_ANDROID_APP_RELEASE.versionName} untuk
            Auto-Catat Tanpa MacroDroid!
          </p>
          <p className="text-[#78350F] leading-relaxed">
            Versi terbaru APK ArusKas ({LATEST_ANDROID_APP_RELEASE.sizeLabel})
            membawa pembaca notifikasi bawaan + Pemilih Aplikasi HP + enkripsi
            AndroidKeyStore.
          </p>
          <a
            href={LATEST_ANDROID_APP_RELEASE.apkUrl}
            download="ArusKas.apk"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#14532D] px-3.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#166534]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              Download Update APK v{LATEST_ANDROID_APP_RELEASE.versionName}
            </span>
          </a>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] p-4 space-y-2.5 text-xs">
        <p className="font-semibold text-[#14532D]">
          Cara Termudah di Android: Pakai APK ArusKas v
          {LATEST_ANDROID_APP_RELEASE.versionName} (Auto-Catat Bawaan)
        </p>
        <p className="text-[#166534] leading-relaxed">
          Pasang <strong>ArusKas.apk</strong> (
          {LATEST_ANDROID_APP_RELEASE.sizeLabel}), lalu buka halaman{" "}
          <strong>Integrasi Bank</strong> dari dalam aplikasi ArusKas untuk
          mengaktifkan pembaca notifikasi bank &amp; e-wallet bawaan{" "}
          <strong>tanpa perlu MacroDroid</strong>.
        </p>
        <a
          href={LATEST_ANDROID_APP_RELEASE.apkUrl}
          download="ArusKas.apk"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#14532D] px-3.5 text-xs font-semibold text-[#FFFFFF] hover:bg-[#166534]"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download ArusKas.apk (Android)</span>
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-[#245A3E]/30 bg-gradient-to-br from-[#EFF6F1] via-[#F7FAF8] to-[#FAF1E0]/70 p-4 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="rounded-xl bg-[#14532D] p-2 text-[#FAF0DD] shrink-0">
              <BellRing className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#14532D]">
                Auto-Catat Bawaan ArusKas (Tanpa MacroDroid)
              </p>
              <p className="text-[11px] text-[#57534E] leading-relaxed mt-0.5">
                Token terenkripsi hardware Keystore HP. Pilih aplikasi bank &amp;
                e-wallet Anda secara spesifik.
              </p>
            </div>
          </div>
          <Badge
            variant={
              nativeStatus.enabled &&
              nativeStatus.notificationAccess &&
              nativeStatus.hasToken
                ? "inflow"
                : "warning"
            }
          >
            {nativeStatus.enabled &&
            nativeStatus.notificationAccess &&
            nativeStatus.hasToken
              ? "Aktif"
              : "Perlu Aktivasi"}
          </Badge>
        </div>

        {/* Step Status Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl border border-[#D6E6DC] bg-[#FFFFFF] p-3 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#1C1917]">
                1. Izin Notifikasi HP
              </span>
              <Badge
                variant={
                  nativeStatus.notificationAccess ? "inflow" : "warning"
                }
              >
                {nativeStatus.notificationAccess ? "Diizinkan" : "Belum Izin"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={
                  nativeStatus.notificationAccess ? "secondary" : "primary"
                }
                onClick={() =>
                  window.ArusKasNative?.openNotificationAccessSettings?.()
                }
                className="h-8 text-[11px]"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>
                  {nativeStatus.notificationAccess
                    ? "Kelola Izin"
                    : "Buka Izin Notifikasi"}
                </span>
              </Button>
              {!nativeStatus.notificationAccess && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    window.ArusKasNative?.openAppInfoSettings?.()
                  }
                  className="h-8 text-[11px]"
                >
                  <span>Info Aplikasi</span>
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#D6E6DC] bg-[#FFFFFF] p-3 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#1C1917]">
                2. Layanan Auto-Catat
              </span>
              <Badge
                variant={
                  nativeStatus.enabled && nativeStatus.hasToken
                    ? "inflow"
                    : "neutral"
                }
              >
                {nativeStatus.enabled && nativeStatus.hasToken
                  ? "Berjalan"
                  : nativeStatus.hasToken
                    ? "Dijeda"
                    : "Belum Terhubung"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {!nativeStatus.hasToken ? (
                <Button
                  type="button"
                  size="sm"
                  loading={nativeBusy}
                  onClick={() => void onConnect()}
                  className="h-8 text-[11px]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Hubungkan &amp; Aktifkan</span>
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={nativeStatus.enabled ? "secondary" : "primary"}
                    onClick={() => onToggleEnabled(!nativeStatus.enabled)}
                    className="h-8 text-[11px]"
                  >
                    <span>
                      {nativeStatus.enabled ? "Jeda Sementara" : "Aktifkan Lagi"}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={nativeBusy}
                    onClick={() => void onConnect()}
                    className="h-8 text-[11px]"
                    title="Buat token baru & sinkronkan ulang ke aplikasi Android"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Sinkron Ulang</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {!nativeStatus.notificationAccess && (
          <p className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/70 px-3 py-2 text-[11px] text-[#92400E] leading-relaxed">
            <strong>Tip Android 13–15:</strong> Jika sakelar{" "}
            <em>Auto-Catat ArusKas</em> di Akses Notifikasi berwarna abu-abu /
            tidak bisa digeser, ketuk <strong>Info Aplikasi</strong> → ikon{" "}
            <strong>titik tiga (⋮) di pojok kanan atas</strong> →{" "}
            <strong>Izinkan Pengaturan Terbatas</strong>, lalu buka Izin
            Notifikasi lagi.
          </p>
        )}

        <div className="rounded-xl border border-[#D6E6DC] bg-[#FFFFFF] p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#1C1917]">
                3. Aplikasi HP yang Dipantau
              </span>
              <Badge variant={nativeStatus.customAppsMode ? "inflow" : "neutral"}>
                {nativeStatus.customAppsMode
                  ? `${nativeStatus.selectedAppsCount ?? 0} Aplikasi Dipilih`
                  : "Bank & E-Wallet Default"}
              </Badge>
            </div>
            <p className="text-[11px] text-[#78716C] mt-0.5">
              Pilih sendiri aplikasi bank / e-wallet dari HP Anda supaya notif
              promo aplikasi lain tidak ikut tercatat.
            </p>
          </div>

          {canPickInstalledApps ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleOpenAppPicker}
              className="h-8 text-[11px] shrink-0"
            >
              <ListChecks className="h-3.5 w-3.5 text-[#14532D]" />
              <span>Pilih Aplikasi HP</span>
            </Button>
          ) : (
            <a
              href={LATEST_ANDROID_APP_RELEASE.apkUrl}
              download="ArusKas.apk"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D4A045] bg-[#FEF3C7] px-2.5 text-[11px] font-semibold text-[#92400E] hover:bg-[#FDE68A] shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Update ke v{LATEST_ANDROID_APP_RELEASE.versionName}</span>
            </a>
          )}
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[#E7E2D8] bg-[#FFFFFF]/80 px-3 py-2 text-[11px] text-[#44403C] cursor-pointer">
          <input
            type="checkbox"
            checked={nativeStatus.includeExtraApps}
            onChange={(e) => onToggleIncludeExtra(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[#14532D]"
          />
          <span>
            <strong>Juga baca Gmail, SMS &amp; WhatsApp</strong> (opsional —
            otomatis menyaring pesan yang berisi nominal Rupiah &amp; kata
            transaksi bank; cocok untuk uji cepat via WhatsApp atau SMS
            banking).
          </span>
        </label>

        {(nativeStatus.capturedCount > 0 ||
          nativeStatus.lastStatus ||
          nativeStatus.pendingCount > 0) && (
          <div className="rounded-xl border border-[#D6E6DC] bg-[#FFFFFF] px-3 py-2 text-[11px] text-[#57534E] space-y-0.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Tercatat otomatis dari HP:{" "}
                <strong className="text-[#14532D]">
                  {nativeStatus.capturedCount} transaksi
                </strong>
              </span>
              {nativeStatus.pendingCount > 0 && (
                <span className="text-[#B45309] font-medium">
                  Antre offline: {nativeStatus.pendingCount}
                </span>
              )}
            </div>
            {nativeStatus.lastStatus && (
              <p className="text-[11px] text-[#78716C]">
                Status terakhir: {nativeStatus.lastStatus}
                {nativeStatus.lastAt ? ` · ${nativeStatus.lastAt}` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Android Installed Apps Picker Modal */}
      <Modal
        open={appPickerOpen}
        onClose={() => setAppPickerOpen(false)}
        title="Pilih Aplikasi HP untuk Auto-Catat"
        description="Hanya notifikasi transaksi dari aplikasi yang Anda centang di sini yang akan dibaca oleh ArusKas."
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
            <Input
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
              placeholder="Cari aplikasi (misal: myBCA, GoPay, SeaBank, DANA)..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={handleSelectRecommendedAppsOnly}
                className="rounded-lg border border-[#CBE0D2] bg-[#EFF6F1] px-2.5 py-1 text-[11px] font-semibold text-[#14532D] hover:bg-[#DCFCE7] cursor-pointer"
              >
                Pilih Rekomendasi Bank/E-Wallet
              </button>
              <button
                type="button"
                onClick={handleResetAppsDefault}
                className="rounded-lg border border-[#E7E2D8] bg-[#FAF8F4] px-2.5 py-1 text-[11px] font-medium text-[#57534E] hover:bg-[#EFECE4] cursor-pointer"
              >
                Reset ke Default
              </button>
            </div>
            <span className="text-[11px] font-medium text-[#14532D]">
              Terpilih: {selectedPickerCount}
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-[#EFECE4] rounded-xl border border-[#E7E2D8] bg-[#FFFFFF]">
            {filteredInstalledApps.length === 0 ? (
              <p className="p-6 text-center text-xs text-[#78716C]">
                Tidak ada aplikasi yang cocok dengan pencarian Anda.
              </p>
            ) : (
              filteredInstalledApps.map((app) => (
                <label
                  key={app.packageName}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[#FAF8F4] cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={app.selected}
                      onChange={() => handleToggleAppInPicker(app.packageName)}
                      className="h-4 w-4 shrink-0 accent-[#14532D]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs sm:text-sm font-medium text-[#1C1917]">
                        {app.label}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[#78716C]">
                        {app.packageName}
                      </p>
                    </div>
                  </div>
                  {app.isRecommended && (
                    <Badge variant="inflow" className="shrink-0 text-[10px]">
                      Rekomendasi
                    </Badge>
                  )}
                </label>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#E7E2D8]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAppPickerOpen(false)}
            >
              Batal
            </Button>
            <Button type="button" size="sm" onClick={handleSaveAppPicker}>
              Simpan Pilihan ({selectedPickerCount})
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
