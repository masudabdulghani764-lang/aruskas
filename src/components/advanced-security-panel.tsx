"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Fingerprint,
  History,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Modal,
} from "@/components/ui/primitives";
import {
  checkAndroidAppUpdate,
  LATEST_ANDROID_APP_RELEASE,
} from "@/lib/app-version";
import type { SecurityAuditLogItem } from "@/lib/audit-log";

const EVENT_LABELS: Record<
  string,
  { label: string; tone: "inflow" | "outflow" | "neutral" | "warning" }
> = {
  login_success: { label: "Login Berhasil", tone: "inflow" },
  login_google: { label: "Login Google", tone: "inflow" },
  login_2fa_challenge: { label: "Tantangan 2FA", tone: "neutral" },
  login_failed: { label: "Percobaan Login Gagal", tone: "outflow" },
  register: { label: "Pendaftaran Akun", tone: "inflow" },
  password_changed: { label: "Kata Sandi Diubah", tone: "warning" },
  password_reset: { label: "Kata Sandi Direset", tone: "warning" },
  sessions_revoked: { label: "Sesi Lain Dicabut", tone: "warning" },
  totp_enabled: { label: "2FA Diaktifkan", tone: "inflow" },
  totp_disabled: { label: "2FA Dinonaktifkan", tone: "warning" },
  backup_exported: { label: "Ekspor Backup", tone: "neutral" },
  backup_restored: { label: "Pulihkan Backup", tone: "warning" },
  webhook_rotated: { label: "Token Bank Dirotasi", tone: "warning" },
};

function formatAuditTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdvancedSecurityPanel({ isDemo }: { isDemo: boolean }) {
  const [loading, setLoading] = useState(true);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [isGoogleOnly, setIsGoogleOnly] = useState(false);
  const [logs, setLogs] = useState<SecurityAuditLogItem[]>([]);

  // Native Android APK Biometric / PIN Lock state
  const [nativeLockSupported, setNativeLockSupported] = useState(false);
  const [nativeLockEnabled, setNativeLockEnabled] = useState(false);
  const [apkVersion, setApkVersion] = useState<string | null>(null);
  const [apkNeedsUpdate, setApkNeedsUpdate] = useState(false);

  // 2FA Setup Modal
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUri, setSetupUri] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  // 2FA Disable Modal
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);

  const loadSecurityState = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/security-logs", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTotpEnabled(Boolean(data.totpEnabled));
        setIsGoogleOnly(Boolean(data.isGoogleOnly));
        if (Array.isArray(data.logs)) {
          setLogs(data.logs as SecurityAuditLogItem[]);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecurityState();
    if (typeof window !== "undefined") {
      const status = checkAndroidAppUpdate(window.navigator.userAgent);
      setApkVersion(status.installedVersion);
      setApkNeedsUpdate(status.needsUpdate);
      if (window.ArusKasNative?.isSupported) {
        try {
          const supported = Boolean(window.ArusKasNative.isSupported());
          setNativeLockSupported(supported);
          if (supported && window.ArusKasNative.isAppLockEnabled) {
            setNativeLockEnabled(Boolean(window.ArusKasNative.isAppLockEnabled()));
          }
        } catch {
          setNativeLockSupported(false);
        }
      }
    }
  }, [loadSecurityState]);

  function handleToggleNativeLock() {
    if (!window.ArusKasNative?.setAppLockEnabled) return;
    const nextState = !nativeLockEnabled;
    const ok = window.ArusKasNative.setAppLockEnabled(nextState);
    if (ok) {
      setNativeLockEnabled(nextState);
      toast.success(
        nextState
          ? "Kunci Sidik Jari / PIN HP diaktifkan untuk aplikasi ArusKas."
          : "Kunci Sidik Jari / PIN HP dinonaktifkan."
      );
    } else {
      toast.error(
        "Aktifkan Kunci Layar (PIN / Sidik Jari) di Pengaturan HP Android Anda terlebih dahulu."
      );
    }
  }

  async function handleStart2faSetup() {
    setSetupBusy(true);
    try {
      const res = await fetch("/api/settings/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal memulai pengaturan 2FA.");
      }
      setSetupSecret(String(data.secret ?? ""));
      setSetupUri(String(data.otpAuthUri ?? ""));
      setSetupCode("");
      setSetupModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyiapkan 2FA.");
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleConfirmEnable2fa(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = setupCode.replace(/\D/g, "");
    if (cleaned.length !== 6) {
      toast.error("Masukkan 6 digit kode dari Google Authenticator / Authy.");
      return;
    }
    setSetupBusy(true);
    try {
      const res = await fetch("/api/settings/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          secret: setupSecret,
          code: cleaned,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Kode 2FA tidak cocok.");
      }
      setTotpEnabled(true);
      setSetupModalOpen(false);
      toast.success("Autentikasi 2 Langkah (2FA) berhasil diaktifkan!");
      void loadSecurityState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengaktifkan 2FA.");
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleDisable2fa(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = disableCode.replace(/\D/g, "");
    if (cleaned.length !== 6) {
      toast.error("Masukkan 6 digit kode Authenticator.");
      return;
    }
    setDisableBusy(true);
    try {
      const res = await fetch("/api/settings/2fa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: disablePassword || undefined,
          code: cleaned,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal menonaktifkan 2FA.");
      }
      setTotpEnabled(false);
      setDisableModalOpen(false);
      setDisablePassword("");
      setDisableCode("");
      toast.success("Autentikasi 2 Langkah (2FA) dinonaktifkan.");
      void loadSecurityState();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan 2FA.");
    } finally {
      setDisableBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 2FA & Native APK Biometric Lock */}
      <Card padding="md">
        <CardHeader
          serif
          title="Proteksi Lapis Kedua (2FA & Kunci HP)"
          subtitle="Amankan akun dengan kode 6 digit Authenticator dan kunci sidik jari / PIN di APK Android."
          action={
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#CBE0D2] bg-[#EFF6F1] text-[#14532D]">
              <ShieldCheck className="h-4 w-4" />
            </span>
          }
        />

        <div className="space-y-4">
          {/* 2FA Authenticator Row */}
          <div className="rounded-2xl border border-[#E7E2D8] bg-[#F7F5F0]/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#14532D]" />
                  <p className="text-sm font-semibold text-[#1C1917]">
                    Autentikasi 2 Langkah (TOTP 2FA)
                  </p>
                </div>
                <p className="text-xs text-[#57534E] leading-relaxed">
                  Kunci 2FA dienkripsi AES-256-GCM di database. Meminta kode 6
                  digit dari Google Authenticator / Authy saat login email.
                </p>
              </div>
              <Badge variant={totpEnabled ? "inflow" : "neutral"}>
                {totpEnabled ? "Aktif" : "Nonaktif"}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {totpEnabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isDemo}
                  onClick={() => setDisableModalOpen(true)}
                >
                  Nonaktifkan 2FA
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isDemo || loading}
                  loading={setupBusy}
                  onClick={() => void handleStart2faSetup()}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Aktifkan 2FA Authenticator</span>
                </Button>
              )}
            </div>
          </div>

          {/* Native Android Biometric / PIN Lock */}
          <div className="rounded-2xl border border-[#E7E2D8] bg-[#F7F5F0]/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-[#14532D]" />
                  <p className="text-sm font-semibold text-[#1C1917]">
                    Kunci Sidik Jari / PIN Layar (APK Android)
                  </p>
                </div>
                <p className="text-xs text-[#57534E] leading-relaxed">
                  {nativeLockSupported
                    ? "Meminta verifikasi sidik jari, wajah, atau PIN HP Anda setiap kali membuka kembali aplikasi ArusKas."
                    : "Tersedia otomatis saat Anda membuka Pengaturan dari dalam aplikasi ArusKas APK v1.0.3+ di HP Android."}
                </p>
              </div>
              <Badge
                variant={
                  nativeLockSupported
                    ? nativeLockEnabled
                      ? "inflow"
                      : "neutral"
                    : "neutral"
                }
              >
                {nativeLockSupported
                  ? nativeLockEnabled
                    ? "Aktif"
                    : "Nonaktif"
                  : "APK v1.0.3+"}
              </Badge>
            </div>

            {nativeLockSupported && (
              <Button
                type="button"
                variant={nativeLockEnabled ? "secondary" : "primary"}
                size="sm"
                onClick={handleToggleNativeLock}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>
                  {nativeLockEnabled
                    ? "Matikan Kunci Sidik Jari / PIN"
                    : "Aktifkan Kunci Sidik Jari / PIN"}
                </span>
              </Button>
            )}
          </div>

          {/* Database Hardening & APK Version Summary */}
          <div className="rounded-xl border border-[#CBE0D2] bg-[#EFF6F1]/70 px-3.5 py-2.5 text-xs text-[#166534] flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#14532D] mt-0.5" />
            <div className="space-y-1">
              <span>
                Lampiran struk &amp; rahasia 2FA kini terenkripsi{" "}
                <strong>AES-256-GCM</strong> di database, koneksi TLS wajib aktif,
                dan backup cookie APK dimatikan.
              </span>
              {apkVersion && (
                <p className="font-medium text-[#14532D]">
                  Versi APK terpasang: <strong>v{apkVersion}</strong>{" "}
                  {apkNeedsUpdate ? (
                    <a
                      href={`${LATEST_ANDROID_APP_RELEASE.apkUrl}?v=${LATEST_ANDROID_APP_RELEASE.versionName}`}
                      className="underline font-bold"
                    >
                      → Update ke v{LATEST_ANDROID_APP_RELEASE.versionName}
                    </a>
                  ) : (
                    <span>(Sudah versi terbaru ✓)</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Permanent Security Audit Logs */}
      <Card padding="md">
        <CardHeader
          serif
          title="Log Aktivitas Keamanan"
          subtitle="Riwayat 20 aktivitas sensitif terakhir (login, gagal masuk, ubah sandi, 2FA)."
          action={
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#14532D]">
              <History className="h-4 w-4" />
            </span>
          }
        />

        {loading ? (
          <p className="text-xs text-[#78716C] py-4">Memuat log keamanan...</p>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E7E2D8] p-5 text-center text-xs text-[#78716C]">
            Belum ada catatan aktivitas keamanan terbaru. Aktivitas login dan
            perubahan keamanan akan tercatat otomatis di sini.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-[#EFECE4] pr-1">
            {logs.map((item) => {
              const meta = EVENT_LABELS[item.eventType] ?? {
                label: item.eventType,
                tone: "neutral" as const,
              };
              return (
                <div
                  key={item.id}
                  className="py-2.5 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={meta.tone}>{meta.label}</Badge>
                      <span className="text-[#57534E] font-medium truncate">
                        {item.deviceLabel}
                      </span>
                    </div>
                    {item.metadata && (
                      <p className="text-[11px] text-[#78716C] truncate">
                        {item.metadata}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 text-[11px] text-[#78716C] tnum">
                    <p>{formatAuditTime(item.createdAt)}</p>
                    <p className="font-mono text-[10px]">{item.ipMasked}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Setup 2FA Modal */}
      <Modal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        title="Aktifkan 2FA Authenticator"
        description="Tambahkan kunci berikut ke Google Authenticator, Authy, atau Microsoft Authenticator."
        size="sm"
      >
        <form onSubmit={handleConfirmEnable2fa} className="space-y-4">
          <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#1C1917]">
              1. Salin Kunci Rahasia (Setup Key):
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] px-3 py-2">
              <code className="text-xs font-mono font-semibold text-[#14532D] break-all">
                {setupSecret}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(setupSecret);
                  toast.success("Kunci 2FA disalin.");
                }}
                className="rounded-md p-1.5 text-[#57534E] hover:bg-[#EFECE4] shrink-0 cursor-pointer"
                aria-label="Salin kunci 2FA"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            {setupUri && (
              <a
                href={setupUri}
                className="inline-flex text-xs font-semibold text-[#14532D] hover:underline underline-offset-4"
              >
                Buka langsung di aplikasi Authenticator →
              </a>
            )}
          </div>

          <Input
            label="2. Masukkan Kode 6 Digit dari Authenticator"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            required
            value={setupCode}
            onChange={(e) =>
              setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSetupModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" loading={setupBusy}>
              Konfirmasi &amp; Aktifkan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal
        open={disableModalOpen}
        onClose={() => setDisableModalOpen(false)}
        title="Nonaktifkan 2FA Authenticator"
        description="Konfirmasi identitas Anda sebelum mematikan perlindungan 2 langkah."
        size="sm"
      >
        <form onSubmit={handleDisable2fa} className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 p-3 text-xs text-[#92400E]">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Menonaktifkan 2FA akan menurunkan perlindungan saat login dengan
              email &amp; kata sandi.
            </span>
          </div>

          {!isGoogleOnly && (
            <Input
              label="Kata Sandi Saat Ini"
              type="password"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          )}

          <Input
            label="Kode 6 Digit Authenticator"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            required
            value={disableCode}
            onChange={(e) =>
              setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDisableModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="danger" loading={disableBusy}>
              Nonaktifkan 2FA
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
