"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Share,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ArusKasLogoMark } from "@/components/aruskas-logo";
import { Button, Modal, cn } from "@/components/ui/primitives";

const APK_DOWNLOAD_PATH = "/downloads/ArusKas.apk";
const IOS_PROFILE_DOWNLOAD_PATH = "/downloads/ArusKas.mobileconfig";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __aruskasDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

const INSTALL_EVENT_NAME = "aruskas-pwa-prompt-ready";

/**
 * Registers the ArusKas Service Worker and captures the browser's native
 * `beforeinstallprompt` event so any Install button across the app can trigger it.
 */
export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal in private browsing or restricted contexts
      });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__aruskasDeferredPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_EVENT_NAME));
    };

    const handleAppInstalled = () => {
      window.__aruskasDeferredPrompt = null;
      window.dispatchEvent(new Event(INSTALL_EVENT_NAME));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  return null;
}

function usePwaInstallState() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true ||
      document.referrer.startsWith("android-app://") ||
      window.navigator.userAgent.includes("ArusKasApp/");
    setIsInstalled(standalone);
    setHydrated(true);

    const ua = window.navigator.userAgent;
    setIsIos(
      /iPad|iPhone|iPod/.test(ua) &&
        !(window as unknown as { MSStream?: unknown }).MSStream
    );

    setDeferredPrompt(window.__aruskasDeferredPrompt ?? null);

    const sync = () => {
      setDeferredPrompt(window.__aruskasDeferredPrompt ?? null);
      const nowStandalone = window.matchMedia(
        "(display-mode: standalone)"
      ).matches;
      if (nowStandalone) setIsInstalled(true);
    };

    window.addEventListener(INSTALL_EVENT_NAME, sync);
    return () => window.removeEventListener(INSTALL_EVENT_NAME, sync);
  }, []);

  async function triggerInstall() {
    if (isInstalled) {
      toast.info("Aplikasi ArusKas sudah terpasang di perangkat Anda.");
      return;
    }

    const promptEvent = deferredPrompt ?? window.__aruskasDeferredPrompt ?? null;
    if (promptEvent) {
      setInstalling(true);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          toast.success("ArusKas sedang dipasang ke layar utama Anda!");
          window.__aruskasDeferredPrompt = null;
          setDeferredPrompt(null);
          setIsInstalled(true);
        }
      } catch {
        setGuideOpen(true);
      } finally {
        setInstalling(false);
      }
      return;
    }

    setGuideOpen(true);
  }

  return {
    canNativeInstall: Boolean(deferredPrompt),
    hydrated,
    isInstalled,
    isIos,
    installing,
    guideOpen,
    setGuideOpen,
    triggerInstall,
  };
}

function InstallGuideModal({
  open,
  onClose,
  isIos,
}: {
  open: boolean;
  onClose: () => void;
  isIos: boolean;
}) {
  const iosCard = (
    <div className="rounded-2xl border border-[#E3D4BA] bg-[#FAF1E0]/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[#14532D] flex items-center gap-1.5">
          <Smartphone className="h-4 w-4" />
          <span>iPhone / iPad (Profil Aplikasi iOS)</span>
        </p>
        <span className="rounded-full bg-[#B45309] px-2 py-0.5 text-[10px] font-semibold text-[#FFFFFF]">
          34 KB
        </span>
      </div>
      <p className="text-xs text-[#44403C] leading-relaxed">
        Unduh profil aplikasi <strong>ArusKas.mobileconfig</strong> (buka di
        Safari), lalu ketuk <strong>Izinkan</strong> → buka{" "}
        <strong>Pengaturan iPhone → Profil Diunduh → Instal</strong>.
      </p>
      <a
        href={IOS_PROFILE_DOWNLOAD_PATH}
        onClick={() =>
          toast.success(
            "Profil iOS diunduh — ketuk Izinkan lalu buka Pengaturan → Profil Diunduh → Instal!"
          )
        }
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C99133] bg-gradient-to-r from-[#F5D284] via-[#E9BC66] to-[#DDA444] px-4 text-xs sm:text-sm font-bold text-[#0D2E1D] transition-colors hover:from-[#F9DF9B] hover:to-[#E5B258]"
      >
        <Download className="h-4 w-4" />
        <span>Download Aplikasi iPhone (.mobileconfig)</span>
      </a>

      <div className="border-t border-[#E3D4BA] pt-2.5 space-y-1">
        <p className="text-[11px] font-semibold text-[#57534E] flex items-center gap-1">
          <Share className="h-3 w-3" />
          <span>Atau cara cepat langsung dari Safari:</span>
        </p>
        <p className="text-[11px] text-[#57534E] leading-relaxed">
          Ketuk <strong>Share (↑)</strong> →{" "}
          <strong>Tambah ke Layar Utama</strong> → <strong>Tambah</strong>.
        </p>
      </div>
    </div>
  );

  const androidCard = (
    <div className="rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[#14532D] flex items-center gap-1.5">
          <Smartphone className="h-4 w-4" />
          <span>Android (File APK Resmi)</span>
        </p>
        <span className="rounded-full bg-[#14532D] px-2 py-0.5 text-[10px] font-semibold text-[#FAF0DD]">
          218 KB
        </span>
      </div>
      <p className="text-xs text-[#166534] leading-relaxed">
        Unduh file <strong>ArusKas.apk</strong>, lalu ketuk file hasil unduhan
        dan pilih <strong>Instal</strong> (aktifkan{" "}
        <em>Izinkan dari sumber ini</em> jika diminta Android).
      </p>
      <a
        href={APK_DOWNLOAD_PATH}
        download="ArusKas.apk"
        onClick={() => toast.success("Mengunduh ArusKas.apk (218 KB)...")}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#14532D] px-4 text-xs sm:text-sm font-semibold text-[#FFFFFF] transition-colors hover:bg-[#166534]"
      >
        <Download className="h-4 w-4" />
        <span>Download ArusKas.apk (Android)</span>
      </a>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unduh & Instal Aplikasi ArusKas"
      description="Tersedia file instalasi langsung untuk Android (.apk) dan iPhone / iPad (.mobileconfig)."
      size="sm"
    >
      <div className="space-y-4 text-xs sm:text-sm text-[#44403C]">
        {isIos ? (
          <>
            {iosCard}
            {androidCard}
          </>
        ) : (
          <>
            {androidCard}
            {iosCard}
          </>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Clickable "Download APK / Instal Aplikasi" button supporting Warm Gold,
 * Header Pill, Forest, Outline, and Profile Menu Item styles.
 */
export function PwaInstallButton({
  variant = "gold",
  label = "Download APK Android",
  className,
  onAfterClick,
}: {
  variant?: "gold" | "header-pill" | "forest" | "outline" | "menu-item";
  label?: string;
  className?: string;
  onAfterClick?: () => void;
}) {
  const { hydrated, isInstalled, isIos, guideOpen, setGuideOpen } =
    usePwaInstallState();

  if (!hydrated || isInstalled) {
    return null;
  }

  return (
    <>
      {variant === "menu-item" ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onAfterClick?.();
            setGuideOpen(true);
          }}
          className={cn(
            "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-[#14532D] font-semibold transition-colors hover:bg-[#EFECE4]/70 cursor-pointer",
            className
          )}
        >
          <Download className="h-4 w-4 text-[#B45309]" />
          <span>{label}</span>
        </button>
      ) : variant === "header-pill" ? (
        <a
          href={isIos ? IOS_PROFILE_DOWNLOAD_PATH : APK_DOWNLOAD_PATH}
          download={isIos ? undefined : "ArusKas.apk"}
          onClick={() => {
            onAfterClick?.();
            if (isIos) {
              toast.success(
                "Profil iPhone diunduh — ketuk Izinkan lalu buka Pengaturan → Profil Diunduh → Instal!"
              );
              setGuideOpen(true);
            } else {
              toast.success("Mengunduh ArusKas.apk (218 KB)...");
            }
          }}
          className={cn(
            "inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-full border border-[#D4A045] bg-gradient-to-r from-[#F6D58E] to-[#E5B869] px-3 text-xs font-bold text-[#0D2E1D] shadow-2xs transition-colors hover:from-[#F9DF9F] hover:to-[#ECC57C] cursor-pointer",
            className
          )}
        >
          <Download className="h-3.5 w-3.5" />
          <span>{isIos ? "Download iPhone" : label}</span>
        </a>
      ) : (
        <a
          href={isIos ? IOS_PROFILE_DOWNLOAD_PATH : APK_DOWNLOAD_PATH}
          download={isIos ? undefined : "ArusKas.apk"}
          onClick={() => {
            onAfterClick?.();
            if (isIos) {
              toast.success(
                "Profil iPhone diunduh — ketuk Izinkan lalu buka Pengaturan → Profil Diunduh → Instal!"
              );
              setGuideOpen(true);
            } else {
              toast.success("Mengunduh ArusKas.apk (218 KB)...");
            }
          }}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors cursor-pointer",
            variant === "gold"
              ? "border border-[#C99133] bg-gradient-to-r from-[#F5D284] via-[#E9BC66] to-[#DDA444] text-[#0D2E1D] shadow-sm hover:from-[#F9DF9B] hover:to-[#E5B258]"
              : variant === "forest"
                ? "border border-[#E5B869] bg-[#FAF0DD] text-[#14532D] hover:bg-[#FFFFFF]"
                : "border border-[#CBE0D2] bg-[#EFF6F1] text-[#14532D] hover:bg-[#DCFCE7]",
            className
          )}
        >
          <Download className="h-4 w-4" />
          <span>{isIos ? "Download Aplikasi iPhone" : label}</span>
        </a>
      )}

      <InstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        isIos={isIos}
      />
    </>
  );
}

/**
 * Dedicated high-visibility Android APK & iOS App Install Spotlight card for the Landing Page.
 */
export function PwaInstallShowcaseCard() {
  const {
    hydrated,
    isInstalled,
    isIos,
    guideOpen,
    setGuideOpen,
  } = usePwaInstallState();

  if (!hydrated || isInstalled) {
    return null;
  }

  return (
    <>
      <section className="border-b border-[#E3D4BA] bg-cream-canvas py-8 sm:py-10">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div
            className="hero-forest-surface rounded-3xl border border-[#245A3E] p-5 sm:p-7 text-[#FAF8F4] shadow-sm flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
            style={{
              backgroundImage:
                "radial-gradient(circle at 92% 15%, rgba(229, 184, 105, 0.25) 0%, rgba(229, 184, 105, 0) 55%), linear-gradient(135deg, #14532D 0%, #113B26 58%, #0D2E1D 100%)",
            }}
          >
            <div className="flex items-start gap-4">
              {/* App Icon Preview */}
              <ArusKasLogoMark className="h-14 w-14 sm:h-16 sm:w-16 border border-[#E5B869]/60" />

              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5B869]/40 bg-[#E5B869]/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#F5D284]">
                  <Sparkles className="h-3 w-3" />
                  <span>Aplikasi Android (.APK) &amp; iPhone</span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-medium text-[#FFFFFF] leading-snug">
                  Download Aplikasi ArusKas — Android (218 KB) &amp; iPhone (34 KB)
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#D6EAE0]">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" />
                    Unduh langsung untuk Android (.apk) &amp; iPhone (.mobileconfig)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" />
                    Layar penuh tanpa bar browser &amp; otomatis ter-update
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" />
                    Data tersinkron real-time ke cloud
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <a
                href={APK_DOWNLOAD_PATH}
                download="ArusKas.apk"
                onClick={() =>
                  toast.success(
                    "Mengunduh ArusKas.apk (218 KB) — ketuk file selesai unduh untuk menginstal!"
                  )
                }
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#F5D284] bg-gradient-to-r from-[#F6D58E] via-[#E9BC66] to-[#DDA444] px-6 text-sm font-bold text-[#0D2E1D] shadow-sm transition-colors hover:from-[#FAE3A6] hover:to-[#E8B85C] cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download APK Android</span>
              </a>

              <a
                href={IOS_PROFILE_DOWNLOAD_PATH}
                onClick={(e) => {
                  if (!isIos) {
                    e.preventDefault();
                    setGuideOpen(true);
                  } else {
                    toast.success(
                      "Profil iPhone diunduh — ketuk Izinkan lalu buka Pengaturan → Profil Diunduh → Instal!"
                    );
                    setGuideOpen(true);
                  }
                }}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full border border-[#E5B869]/60 bg-[#17482F] px-5 text-xs sm:text-sm font-semibold text-[#FAF0DD] transition-colors hover:bg-[#1E5B3C] cursor-pointer"
              >
                <Smartphone className="h-4 w-4 text-[#E5B869]" />
                <span>Download iPhone (iOS)</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <InstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        isIos={isIos}
      />
    </>
  );
}

/**
 * High-contrast, dismissible install banner shown at the top of the authenticated
 * app shell until the user installs ArusKas or dismisses it.
 */
export function PwaInstallBanner() {
  const { hydrated, isInstalled, isIos, guideOpen, setGuideOpen } =
    usePwaInstallState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("aruskas_pwa_banner_v3");
      setDismissed(saved === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!hydrated || isInstalled || dismissed) {
    return null;
  }

  return (
    <>
      <div
        className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#245A3E] px-4 py-3 text-xs sm:text-sm text-[#FAF8F4] shadow-xs"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #14532D 0%, #113B26 60%, #0D2E1D 100%)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ArusKasLogoMark
            rounded="rounded-xl"
            className="h-9 w-9 border border-[#E5B869]/50"
          />
          <div className="min-w-0">
            <p className="font-semibold text-[#FFFFFF] flex items-center gap-1.5">
              <span>
                {isIos
                  ? "Download Aplikasi iPhone ArusKas (.mobileconfig)"
                  : "Download Aplikasi Android ArusKas (.APK)"}
              </span>
              <span className="hidden sm:inline-flex rounded-full bg-[#E5B869]/20 px-2 py-0.5 text-[10px] font-semibold text-[#F5D284]">
                {isIos ? "34 KB" : "218 KB"}
              </span>
            </p>
            <p className="text-[11px] sm:text-xs text-[#C6DDD0]">
              Tampil layar penuh 100% tanpa browser bar — tersedia langsung
              untuk Android &amp; iPhone.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={isIos ? IOS_PROFILE_DOWNLOAD_PATH : APK_DOWNLOAD_PATH}
            download={isIos ? undefined : "ArusKas.apk"}
            onClick={() => {
              if (isIos) {
                toast.success(
                  "Profil iPhone diunduh — ketuk Izinkan lalu buka Pengaturan → Profil Diunduh → Instal!"
                );
                setGuideOpen(true);
              } else {
                toast.success("Mengunduh ArusKas.apk (218 KB)...");
              }
            }}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-full border border-[#F5D284] bg-gradient-to-r from-[#F6D58E] to-[#E5B869] px-3.5 text-xs font-bold text-[#0D2E1D] transition-colors hover:from-[#FAE3A6] hover:to-[#ECC57C] cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isIos ? "Download iPhone" : "Download APK"}</span>
          </a>
          <button
            type="button"
            aria-label="Tutup banner instalasi"
            onClick={() => {
              setDismissed(true);
              try {
                window.localStorage.setItem("aruskas_pwa_banner_v3", "1");
              } catch {
                // ignore
              }
            }}
            className="rounded-lg p-1.5 text-[#C6DDD0] hover:bg-[#1E5B3C] hover:text-[#FFFFFF] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <InstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        isIos={isIos}
      />
    </>
  );
}
