"use client";

import React, { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal, cn } from "@/components/ui/primitives";

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
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream);

    setDeferredPrompt(window.__aruskasDeferredPrompt ?? null);

    const sync = () => {
      setDeferredPrompt(window.__aruskasDeferredPrompt ?? null);
      const nowStandalone = window.matchMedia("(display-mode: standalone)").matches;
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

    // Fallback: show clear 2-step guide for iOS Safari / browsers without native prompt
    setGuideOpen(true);
  }

  return {
    canNativeInstall: Boolean(deferredPrompt),
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instal Aplikasi ArusKas di HP"
      description="Tampil layar penuh tanpa bar browser, ringan, dan gratis tanpa Play Store."
      size="sm"
    >
      <div className="space-y-4 text-xs sm:text-sm text-[#44403C]">
        {isIos ? (
          <div className="rounded-2xl border border-[#E3D4BA] bg-[#FAF1E0]/70 p-4 space-y-2">
            <p className="font-semibold text-[#14532D] flex items-center gap-1.5">
              <Share className="h-4 w-4" />
              <span>Cara Instal di iPhone / iPad (Safari):</span>
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>
                Ketuk ikon <strong>Bagikan / Share (↑)</strong> di bagian bawah
                Safari.
              </li>
              <li>
                Pilih <strong>Tambah ke Layar Utama</strong> (
                <em>Add to Home Screen</em>).
              </li>
              <li>
                Ketuk <strong>Tambah</strong> — ikon <strong>ArusKas.</strong>{" "}
                langsung muncul di layar utama!
              </li>
            </ol>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] p-4 space-y-2">
            <p className="font-semibold text-[#14532D] flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" />
              <span>Cara Instal di Android (Chrome):</span>
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>
                Ketuk ikon <strong>titik tiga (⋮)</strong> di pojok kanan atas
                browser Chrome.
              </li>
              <li>
                Pilih <strong>Tambahkan ke layar utama</strong> (
                <em>Add to Home screen</em>) lalu pilih <strong>Instal</strong>.
              </li>
              <li>
                Aplikasi <strong>ArusKas</strong> langsung masuk ke daftar
                aplikasi Android Anda!
              </li>
            </ol>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Mengerti
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Clickable "Instal Aplikasi" button for Landing Page, Header, or Profile Menu.
 */
export function PwaInstallButton({
  variant = "outline",
  label = "Instal Aplikasi",
  className,
  onAfterClick,
}: {
  variant?: "outline" | "forest" | "menu-item";
  label?: string;
  className?: string;
  onAfterClick?: () => void;
}) {
  const { isInstalled, isIos, installing, guideOpen, setGuideOpen, triggerInstall } =
    usePwaInstallState();

  if (isInstalled) {
    return null;
  }

  return (
    <>
      {variant === "menu-item" ? (
        <button
          type="button"
          role="menuitem"
          disabled={installing}
          onClick={() => {
            onAfterClick?.();
            void triggerInstall();
          }}
          className={cn(
            "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-[#14532D] font-medium transition-colors hover:bg-[#EFECE4]/70 cursor-pointer",
            className
          )}
        >
          <Download className="h-4 w-4 text-[#14532D]" />
          <span>{installing ? "Memasang..." : label}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={installing}
          onClick={() => {
            onAfterClick?.();
            void triggerInstall();
          }}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60",
            variant === "forest"
              ? "border border-[#E5B869] bg-[#FAF0DD] text-[#14532D] hover:bg-[#FFFFFF]"
              : "border border-[#CBE0D2] bg-[#EFF6F1] text-[#14532D] hover:bg-[#DCFCE7]",
            className
          )}
        >
          <Download className="h-4 w-4" />
          <span>{installing ? "Memasang..." : label}</span>
        </button>
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
 * Compact, dismissible install prompt banner shown automatically inside the app
 * when Chrome/Android reports the app is ready for 1-tap native installation.
 */
export function PwaInstallBanner() {
  const {
    canNativeInstall,
    isInstalled,
    isIos,
    installing,
    guideOpen,
    setGuideOpen,
    triggerInstall,
  } = usePwaInstallState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("aruskas_pwa_banner_dismissed");
      setDismissed(saved === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (isInstalled || dismissed || !canNativeInstall) {
    return null;
  }

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] px-4 py-3 text-xs sm:text-sm text-[#14532D]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#14532D] text-[#FAF0DD]">
            <Smartphone className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[#14532D]">
              Pasang ArusKas di layar utama HP Anda
            </p>
            <p className="text-[11px] sm:text-xs text-[#166534]">
              Akses cepat 1 sentuhan tanpa browser bar, ringan &amp; gratis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="primary"
            loading={installing}
            onClick={() => void triggerInstall()}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Instal Sekarang</span>
          </Button>
          <button
            type="button"
            aria-label="Tutup banner instalasi"
            onClick={() => {
              setDismissed(true);
              try {
                window.localStorage.setItem(
                  "aruskas_pwa_banner_dismissed",
                  "1"
                );
              } catch {
                // ignore
              }
            }}
            className="rounded-lg p-1.5 text-[#57534E] hover:bg-[#DCFCE7] cursor-pointer"
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
