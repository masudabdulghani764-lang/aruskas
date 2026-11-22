"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Download, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  checkAndroidAppUpdate,
  type AndroidAppRelease,
} from "@/lib/app-version";

/**
 * Automatically checks `/api/app-version` whenever ArusKas is opened inside the
 * Android APK (`ArusKasApp/x.y.z`). If a newer native APK is available, shows a
 * sleek 1-tap in-app update prompt without needing to open Chrome manually.
 */
export function AppUpdateChecker() {
  const [release, setRelease] = useState<AndroidAppRelease | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent;
    const initialCheck = checkAndroidAppUpdate(ua);
    if (!initialCheck.isAndroidApk || !initialCheck.installedVersion) {
      return;
    }

    let cancelled = false;

    async function checkLatest() {
      try {
        const res = await fetch("/api/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as AndroidAppRelease;
        if (cancelled || !data?.versionName) return;

        const status = checkAndroidAppUpdate(ua, data.versionName);
        if (!status.needsUpdate) return;

        const dismissKey = `aruskas_update_dismissed_${data.versionName}`;
        try {
          if (window.sessionStorage.getItem(dismissKey) === "1") {
            return;
          }
        } catch {
          // ignore sessionStorage restriction
        }

        setInstalledVersion(status.installedVersion);
        setRelease(data);
        setVisible(true);
      } catch {
        // Silent fail when offline
      }
    }

    void checkLatest();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !release || !installedVersion) {
    return null;
  }

  function dismissForSession() {
    setVisible(false);
    if (release) {
      try {
        window.sessionStorage.setItem(
          `aruskas_update_dismissed_${release.versionName}`,
          "1"
        );
      } catch {
        // ignore
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aruskas-update-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-[#245A3E] bg-[#FBFBF9] shadow-xl">
        {/* Forest Header */}
        <div
          className="relative px-5 pt-5 pb-4 text-[#FAF8F4]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, #14532D 0%, #113B26 65%, #0D2E1D 100%)",
          }}
        >
          <button
            type="button"
            aria-label="Tutup pemberitahuan update"
            onClick={dismissForSession}
            className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-[#CBE0D2] hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5B869]/40 bg-[#E5B869]/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#F5D284]">
            <Sparkles className="h-3 w-3" />
            <span>Pembaruan Aplikasi Tersedia</span>
          </div>

          <h2
            id="aruskas-update-title"
            className="mt-2 font-display text-xl font-semibold text-white"
          >
            ArusKas v{release.versionName}
          </h2>
          <p className="mt-0.5 text-xs text-[#CBE0D2]">
            Versi terpasang: v{installedVersion} → Terbaru: v{release.versionName}{" "}
            ({release.sizeLabel})
          </p>
        </div>

        {/* Highlights + 1-Tap Update CTA */}
        <div className="p-5 space-y-4">
          {Array.isArray(release.highlights) && release.highlights.length > 0 && (
            <ul className="space-y-2 text-xs text-[#44403C]">
              {release.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 leading-relaxed">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D] mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="rounded-xl border border-[#E3D4BA] bg-[#FAF1E0]/70 px-3 py-2 text-[11px] text-[#57534E] leading-relaxed">
            Setelah file selesai diunduh, ketuk file <strong>ArusKas.apk</strong>{" "}
            lalu pilih <strong>Update</strong> — semua data dan sesi login Anda
            tetap aman.
          </p>

          <div className="flex flex-col gap-2">
            <a
              href={`${release.apkUrl}?v=${encodeURIComponent(release.versionName)}`}
              download="ArusKas.apk"
              onClick={() => {
                toast.success(
                  `Mengunduh ArusKas v${release.versionName} (${release.sizeLabel})...`
                );
                dismissForSession();
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#C99133] bg-gradient-to-r from-[#F5D284] via-[#E9BC66] to-[#DDA444] px-4 text-sm font-bold text-[#0D2E1D] shadow-xs transition-colors hover:from-[#F9DF9B] hover:to-[#E5B258] cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Update Sekarang ({release.sizeLabel})</span>
            </a>

            <button
              type="button"
              onClick={dismissForSession}
              className="inline-flex h-9 w-full items-center justify-center rounded-xl text-xs font-semibold text-[#57534E] hover:bg-[#EFECE4] hover:text-[#1C1917] cursor-pointer"
            >
              Nanti Saja
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
