"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import {
  checkAndroidAppUpdate,
  LATEST_ANDROID_APP_RELEASE,
  type AndroidAppRelease,
} from "@/lib/app-version";

export type DetectedAppRuntime = {
  ready: boolean;
  platform: "android_apk" | "legacy_apk_or_pwa" | "web";
  installedVersion: string | null;
  latestRelease: AndroidAppRelease;
  needsUpdate: boolean;
};

export function useDetectedAppVersion() {
  const [state, setState] = useState<DetectedAppRuntime>({
    ready: false,
    platform: "web",
    installedVersion: null,
    latestRelease: LATEST_ANDROID_APP_RELEASE,
    needsUpdate: false,
  });
  const [checking, setChecking] = useState(false);

  const detectAndCheck = useCallback(async (showToast = false) => {
    if (typeof window === "undefined") return;
    setChecking(true);

    const ua = window.navigator.userAgent;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true ||
      document.referrer.startsWith("android-app://");

    let latest = LATEST_ANDROID_APP_RELEASE;
    try {
      const res = await fetch("/api/app-version", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as AndroidAppRelease;
        if (data?.versionName) {
          latest = data;
        }
      }
    } catch {
      // Fallback to bundled latest constant when offline
    }

    const apkStatus = checkAndroidAppUpdate(ua, latest.versionName);

    let platform: DetectedAppRuntime["platform"] = "web";
    let installedVersion: string | null = null;
    let needsUpdate = false;

    if (apkStatus.isAndroidApk && apkStatus.installedVersion) {
      platform = "android_apk";
      installedVersion = apkStatus.installedVersion;
      needsUpdate = apkStatus.needsUpdate;
    } else if (isStandalone) {
      platform = "legacy_apk_or_pwa";
      installedVersion = "≤ 1.0.1";
      needsUpdate = /Android/i.test(ua);
    } else {
      platform = "web";
      installedVersion = latest.versionName;
      needsUpdate = false;
    }

    setState({
      ready: true,
      platform,
      installedVersion,
      latestRelease: latest,
      needsUpdate,
    });
    setChecking(false);

    if (showToast) {
      if (needsUpdate) {
        toast.info(
          `Pembaruan ArusKas v${latest.versionName} tersedia! Ketuk tombol Update.`
        );
      } else if (platform === "android_apk") {
        toast.success(
          `Aplikasi ArusKas Anda sudah versi terbaru (v${installedVersion}).`
        );
      } else {
        toast.success(`Versi web selalu terbaru (v${latest.versionName}).`);
      }
    }
  }, []);

  useEffect(() => {
    void detectAndCheck(false);
  }, [detectAndCheck]);

  return { ...state, checking, recheck: () => detectAndCheck(true) };
}

/**
 * Compact version footer inside the top-right Profile Dropdown Menu so the user
 * can check their installed APK version from any page with 1 tap.
 */
export function AppVersionMenuFooter({ onClose }: { onClose?: () => void }) {
  const { ready, platform, installedVersion, latestRelease, needsUpdate } =
    useDetectedAppVersion();

  if (!ready) {
    return null;
  }

  const label =
    platform === "android_apk"
      ? `APK Android v${installedVersion}`
      : platform === "legacy_apk_or_pwa"
        ? `APK Lama (${installedVersion})`
        : `Versi Web v${latestRelease.versionName}`;

  return (
    <div className="border-t border-[#E7E2D8] bg-[#F7F5F0]/70 px-4 py-2 text-[11px] flex items-center justify-between gap-2 rounded-b-2xl">
      <span className="font-medium text-[#57534E] truncate">{label}</span>
      {needsUpdate ? (
        <a
          href={`${latestRelease.apkUrl}?v=${encodeURIComponent(latestRelease.versionName)}`}
          download="ArusKas.apk"
          onClick={() => {
            onClose?.();
            toast.success(
              `Mengunduh ArusKas v${latestRelease.versionName} (${latestRelease.sizeLabel})...`
            );
          }}
          className="inline-flex items-center gap-1 rounded-full bg-[#14532D] px-2 py-0.5 text-[10px] font-bold text-[#FAF0DD] hover:bg-[#166534] shrink-0"
        >
          <Download className="h-2.5 w-2.5" />
          <span>Update v{latestRelease.versionName}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#15803D] shrink-0">
          <CheckCircle2 className="h-3 w-3" />
          <span>Terbaru</span>
        </span>
      )}
    </div>
  );
}

/**
 * Full "Tentang & Versi Aplikasi" card displayed inside Pengaturan showing the
 * exact installed APK version on the user's phone vs the latest server release.
 */
export function AppVersionCard() {
  const {
    ready,
    platform,
    installedVersion,
    latestRelease,
    needsUpdate,
    checking,
    recheck,
  } = useDetectedAppVersion();

  const platformLabel =
    platform === "android_apk"
      ? "Aplikasi Android (Native APK)"
      : platform === "legacy_apk_or_pwa"
        ? "Aplikasi Android Lama / PWA"
        : "Browser Web";

  const installedBadgeText = !ready
    ? "Mendeteksi..."
    : platform === "android_apk"
      ? `v${installedVersion}`
      : platform === "legacy_apk_or_pwa"
        ? `${installedVersion}`
        : `Web v${latestRelease.versionName}`;

  return (
    <Card padding="md">
      <CardHeader
        serif
        title="Versi Aplikasi di Perangkat Ini"
        subtitle="Pantau versi APK ArusKas yang sedang terpasang di HP Anda dan cek pembaruan kapan saja."
        action={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#CBE0D2] bg-[#EFF6F1] text-[#14532D]">
            <Smartphone className="h-4 w-4" />
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/70 px-3.5 py-3">
          <p className="text-[11px] font-medium text-[#78716C]">Mode Akses</p>
          <p className="mt-1 text-sm font-semibold text-[#1C1917]">
            {ready ? platformLabel : "Mendeteksi..."}
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/70 px-3.5 py-3">
          <p className="text-[11px] font-medium text-[#78716C]">
            Versi Terpasang di HP
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-base font-bold text-[#14532D] tnum">
              {installedBadgeText}
            </span>
            {ready && (
              <Badge variant={needsUpdate ? "warning" : "inflow"}>
                {needsUpdate ? "Perlu Update" : "Terbaru"}
              </Badge>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/70 px-3.5 py-3">
          <p className="text-[11px] font-medium text-[#78716C]">
            Versi APK Terbaru
          </p>
          <p className="mt-1 text-base font-bold text-[#1C1917] tnum">
            v{latestRelease.versionName}{" "}
            <span className="text-xs font-normal text-[#78716C]">
              ({latestRelease.sizeLabel})
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {needsUpdate && (
          <a
            href={`${latestRelease.apkUrl}?v=${encodeURIComponent(latestRelease.versionName)}`}
            download="ArusKas.apk"
            onClick={() =>
              toast.success(
                `Mengunduh ArusKas v${latestRelease.versionName} (${latestRelease.sizeLabel})...`
              )
            }
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#C99133] bg-gradient-to-r from-[#F5D284] via-[#E9BC66] to-[#DDA444] px-4 text-xs sm:text-sm font-bold text-[#0D2E1D] shadow-2xs transition-colors hover:from-[#F9DF9B] hover:to-[#E5B258] cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Update ke v{latestRelease.versionName} Sekarang</span>
          </a>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={checking}
          onClick={() => void recheck()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Cek Pembaruan</span>
        </Button>
      </div>
    </Card>
  );
}
