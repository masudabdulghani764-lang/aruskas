"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  Sun,
  Wallet,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AppVersionMenuFooter } from "@/components/app-version-info";
import {
  PwaInstallBanner,
  PwaInstallButton,
} from "@/components/pwa-install-button";
import {
  QuickAddModal,
  type QuickAddType,
} from "@/components/quick-add-modal";
import { useTheme } from "@/components/theme-provider";
import { Badge, Button, cn } from "@/components/ui/primitives";
import type { SafeUser } from "@/lib/auth";
import {
  flushOfflineTransactionQueue,
  getOfflineTransactionQueue,
  OFFLINE_QUEUE_EVENT,
} from "@/lib/offline-queue";

interface QuickAddContextValue {
  openQuickAdd: (
    defaultType?: QuickAddType,
    defaultWalletId?: string
  ) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

/**
 * Provides global Quick-Add modal controls and a refresh counter for client views.
 */
export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) {
    throw new Error("useQuickAdd harus digunakan di dalam AppShell.");
  }
  return ctx;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/transaksi", label: "Transaksi", icon: ReceiptText },
  { href: "/dompet", label: "Dompet", icon: Wallet },
  { href: "/anggaran", label: "Anggaran", icon: PiggyBank },
  { href: "/laporan", label: "Laporan", icon: BarChart3 },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "AK";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Authenticated Warm Ivory Paper application shell with top desktop navigation,
 * mobile bottom tab bar, global `N` quick-add shortcut, and profile menu.
 */
export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme, toggleTheme } = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{
    type: QuickAddType;
    walletId?: string;
  }>({ type: "expense" });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const syncOfflineNow = useCallback(async () => {
    if (syncingOffline) return;
    const queued = getOfflineTransactionQueue();
    if (queued.length === 0) {
      setOfflineQueueCount(0);
      return;
    }
    setSyncingOffline(true);
    try {
      const result = await flushOfflineTransactionQueue();
      setOfflineQueueCount(result.remaining);
      if (result.synced > 0) {
        toast.success(
          `${result.synced} transaksi dari antrean offline berhasil disinkronkan!`
        );
        triggerRefresh();
        router.refresh();
      }
      if (result.failed > 0) {
        toast.warning(
          `${result.failed} transaksi antrean dilewati karena sesi/data tidak valid.`
        );
      }
    } finally {
      setSyncingOffline(false);
    }
  }, [syncingOffline, triggerRefresh, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateStatus = () => {
      setIsOnline(window.navigator.onLine);
      setOfflineQueueCount(getOfflineTransactionQueue().length);
    };
    const handleOnline = () => {
      updateStatus();
      void syncOfflineNow();
    };
    updateStatus();
    if (window.navigator.onLine && getOfflineTransactionQueue().length > 0) {
      void syncOfflineNow();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", updateStatus);
    window.addEventListener(OFFLINE_QUEUE_EVENT, updateStatus);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", updateStatus);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, updateStatus);
    };
  }, [syncOfflineNow]);

  const openQuickAdd = useCallback(
    (defaultType: QuickAddType = "expense", defaultWalletId?: string) => {
      setModalDefaults({ type: defaultType, walletId: defaultWalletId });
      setModalOpen(true);
    },
    []
  );

  // Global keyboard shortcut `N` to open Quick-Add modal when not typing.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "n" && event.key !== "N") {
        return;
      }
      if (
        isEditableElement(event.target) ||
        isEditableElement(document.activeElement)
      ) {
        return;
      }
      if (modalOpen || document.querySelector('[role="dialog"]')) {
        return;
      }
      event.preventDefault();
      openQuickAdd("expense");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, openQuickAdd]);

  // Close profile dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Gagal keluar. Silakan coba lagi.");
        return;
      }
      toast.success("Anda telah keluar dari akun.");
      router.push("/masuk");
      router.refresh();
    } catch {
      toast.error("Gagal keluar. Silakan coba lagi.");
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  }

  const contextValue = useMemo<QuickAddContextValue>(
    () => ({
      openQuickAdd,
      refreshTrigger,
      triggerRefresh,
    }),
    [openQuickAdd, refreshTrigger, triggerRefresh]
  );

  const initials = getInitials(user.name);

  return (
    <QuickAddContext.Provider value={contextValue}>
      <div className="min-h-screen text-[#1C1917]">
        {/* Top Desktop & Mobile Header (opaque GPU layer — zero backdrop-filter scroll lag) */}
        <header className="no-print sticky top-0 z-30 transform-gpu border-b border-[#E3D4BA] bg-gradient-to-r from-[#FFFFFF] via-[#FCF3E2] to-[#F4E4C6] pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-7">
              <Link
                href="/dashboard"
                className="font-display text-2xl font-semibold tracking-tight text-[#14532D] hover:opacity-90 transition-opacity"
              >
                ArusKas.
              </Link>

              <nav
                aria-label="Navigasi utama"
                className="hidden md:flex items-center gap-1"
              >
                {NAV_ITEMS.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                        active
                          ? "bg-[#EFECE4] text-[#14532D] font-semibold"
                          : "text-[#57534E] hover:bg-[#EFECE4]/65 hover:text-[#1C1917]"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <Link
                  href="/auto-bank"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    pathname === "/auto-bank" ||
                      pathname.startsWith("/auto-bank/") ||
                      pathname === "/integrasi-bca"
                      ? "bg-[#EFECE4] text-[#14532D] font-semibold"
                      : "text-[#57534E] hover:bg-[#EFECE4]/65 hover:text-[#1C1917]"
                  )}
                >
                  <Landmark className="h-3.5 w-3.5 text-[#B45309]" />
                  <span>Auto Bank</span>
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <PwaInstallButton
                variant="header-pill"
                label="Unduh APK"
                className="hidden lg:inline-flex"
              />

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  resolvedTheme === "dark"
                    ? "Ubah ke Mode Terang"
                    : "Ubah ke Mode Gelap"
                }
                title={
                  resolvedTheme === "dark"
                    ? "Mode Terang"
                    : "Mode Gelap (Dark Mode)"
                }
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E] transition-colors hover:bg-[#EFECE4] hover:text-[#14532D] cursor-pointer"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4 text-[#E5B869]" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>

              <Button
                variant="primary"
                size="sm"
                pill
                onClick={() => openQuickAdd("expense")}
                className="hidden sm:inline-flex h-9 px-4 text-xs sm:text-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Catat Kas</span>
                <kbd className="hidden lg:inline-flex items-center rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                  N
                </kbd>
              </Button>

              {/* Profile Dropdown */}
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-full border border-[#E7E2D8] bg-[#FFFFFF] py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-[#EFECE4]/70 cursor-pointer"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFECE4] text-xs font-semibold text-[#14532D]">
                    {initials}
                  </span>
                  <span className="hidden sm:inline max-w-[130px] truncate text-xs font-medium text-[#1C1917]">
                    {user.name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#78716C]" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-[#E7E2D8] bg-[#FFFFFF] pt-1.5 shadow-[0_10px_30px_rgba(28,25,23,0.10)]"
                  >
                    <div className="border-b border-[#E7E2D8] px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[#1C1917]">
                          {user.name}
                        </p>
                        {user.isDemo && <Badge variant="forest">Demo</Badge>}
                      </div>
                      <p className="truncate text-xs text-[#78716C] mt-0.5">
                        {user.email}
                      </p>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/tagihan"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2 text-sm text-[#1C1917] transition-colors hover:bg-[#EFECE4]/70",
                          pathname === "/tagihan" &&
                            "font-semibold text-[#14532D]"
                        )}
                      >
                        <CalendarClock className="h-4 w-4 text-[#B45309]" />
                        <span>Tagihan Bulanan</span>
                      </Link>
                      <Link
                        href="/auto-bank"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2 text-sm text-[#1C1917] transition-colors hover:bg-[#EFECE4]/70",
                          (pathname === "/auto-bank" ||
                            pathname === "/integrasi-bca") &&
                            "font-semibold text-[#14532D]"
                        )}
                      >
                        <Landmark className="h-4 w-4 text-[#B45309]" />
                        <span>Auto-Catat Bank &amp; E-Wallet</span>
                      </Link>
                      <Link
                        href="/pengaturan"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2 text-sm text-[#1C1917] transition-colors hover:bg-[#EFECE4]/70",
                          pathname === "/pengaturan" &&
                            "font-semibold text-[#14532D]"
                        )}
                      >
                        <Settings className="h-4 w-4 text-[#57534E]" />
                        <span>Pengaturan</span>
                      </Link>
                      <PwaInstallButton
                        variant="menu-item"
                        label="Download APK Android / HP"
                      />
                    </div>

                    <div className="border-t border-[#E7E2D8] py-1">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={loggingOut}
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-[#B91C1C] transition-colors hover:bg-[#FEE2E2]/45 disabled:opacity-60 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{loggingOut ? "Keluar..." : "Keluar"}</span>
                      </button>
                    </div>

                    <AppVersionMenuFooter onClose={() => setMenuOpen(false)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Container */}
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:py-8 md:pb-12 print:max-w-none print:p-0">
          {(!isOnline || offlineQueueCount > 0) && (
            <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#FDE68A] bg-[#FEF3C7]/85 px-4 py-2.5 text-xs text-[#92400E]">
              <div className="flex items-center gap-2 min-w-0">
                <WifiOff className="h-4 w-4 shrink-0" />
                <span>
                  {!isOnline
                    ? "Anda sedang offline — transaksi baru tetap bisa dicatat dan masuk antrean otomatis."
                    : `${offlineQueueCount} transaksi menunggu sinkronisasi dari mode offline.`}
                </span>
              </div>
              {isOnline && offlineQueueCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={syncingOffline}
                  onClick={() => void syncOfflineNow()}
                  className="h-7 px-3 text-[11px]"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Kirim Sekarang</span>
                </Button>
              )}
            </div>
          )}
          <PwaInstallBanner />
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (5 tabs + quick `+` button) */}
        <nav
          aria-label="Navigasi seluler"
          className="no-print fixed inset-x-0 bottom-0 z-30 transform-gpu border-t border-[#E3D4BA] bg-gradient-to-r from-[#FFFFFF] via-[#FCF3E2] to-[#F4E4C6] pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="grid grid-cols-6 items-center h-16 px-1">
            {NAV_ITEMS.slice(0, 2).map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors",
                    active ? "text-[#14532D] font-semibold" : "text-[#78716C]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate max-w-full px-0.5">
                    {item.label}
                  </span>
                </Link>
              );
            })}

            <div className="flex items-center justify-center">
              <button
                type="button"
                aria-label="Catat Kas"
                onClick={() => openQuickAdd("expense")}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#14532D] text-[#FFFFFF] shadow-sm transition-colors hover:bg-[#166534] active:scale-95 cursor-pointer"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {NAV_ITEMS.slice(2).map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors",
                    active ? "text-[#14532D] font-semibold" : "text-[#78716C]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate max-w-full px-0.5">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        <QuickAddModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          defaultType={modalDefaults.type}
          defaultWalletId={modalDefaults.walletId}
          onSuccess={triggerRefresh}
        />
      </div>
    </QuickAddContext.Provider>
  );
}
