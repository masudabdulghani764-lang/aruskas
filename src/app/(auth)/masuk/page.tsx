"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { LandingDemoCta } from "@/components/landing-demo-cta";
import { Button, Card, Input, SkeletonCard } from "@/components/ui/primitives";
import { resolveSafeNext } from "@/lib/navigation";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_cancelled: "Login dengan Google dibatalkan.",
  google_invalid_state: "Sesi otorisasi Google tidak valid atau kedaluwarsa. Silakan coba lagi.",
  google_failed: "Gagal masuk menggunakan Google. Silakan coba lagi atau gunakan email.",
  google_not_configured:
    "Login Google belum diaktifkan pada server (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET belum diisi).",
  rate_limited: "Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.",
};

function MasukForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextPath = resolveSafeNext(rawNext);
  const queryError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(
    null
  );
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(
    queryError ? (OAUTH_ERROR_MESSAGES[queryError] ?? null) : null
  );

  async function handleVerify2fa(event: React.FormEvent) {
    event.preventDefault();
    setErrorMsg(null);
    const cleaned = twoFactorCode.replace(/\D/g, "");
    if (cleaned.length !== 6) {
      setErrorMsg("Masukkan 6 digit kode dari aplikasi Authenticator.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: twoFactorChallenge,
          code: cleaned,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Kode 2FA tidak valid.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success("Verifikasi 2FA berhasil. Selamat datang kembali!");
      router.push(nextPath);
      router.refresh();
    } catch {
      const msg = "Terjadi gangguan jaringan. Silakan coba lagi.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg("Masukkan alamat email yang valid.");
      return;
    }
    if (!password) {
      setErrorMsg("Kata sandi wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Email atau kata sandi salah.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      if (data.requiresTwoFactor && data.challengeToken) {
        setTwoFactorChallenge(String(data.challengeToken));
        setTwoFactorCode("");
        toast.info("Masukkan kode 6 digit dari aplikasi Authenticator Anda.");
        return;
      }

      toast.success("Selamat datang kembali di ArusKas.");
      router.push(nextPath);
      router.refresh();
    } catch {
      const msg = "Terjadi gangguan jaringan. Silakan coba lagi.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const daftarHref = rawNext
    ? `/daftar?next=${encodeURIComponent(nextPath)}`
    : "/daftar";

  return (
    <div className="min-h-screen bg-cream-canvas px-4 py-10 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] transition-colors hover:text-[#1C1917]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Beranda</span>
          </Link>
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-[#14532D]"
          >
            ArusKas.
          </Link>
        </div>

        <Card padding="lg">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-medium tracking-tight text-[#1C1917]">
              Masuk ke Akun Anda
            </h1>
            <p className="mt-1 text-sm text-[#78716C]">
              Lanjutkan pencatatan arus kas dan laporan keuangan keluarga.
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {errorMsg}
            </div>
          )}

          {twoFactorChallenge ? (
            <form onSubmit={handleVerify2fa} className="space-y-4" noValidate>
              <div className="flex items-start gap-3 rounded-xl border border-[#CBE0D2] bg-[#EFF6F1] p-3.5 text-xs text-[#14532D]">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Verifikasi 2 Langkah (2FA)</p>
                  <p className="mt-0.5 text-[#166534]">
                    Buka Google Authenticator / Authy lalu masukkan kode 6 digit
                    untuk akun <strong>{email}</strong>.
                  </p>
                </div>
              </div>

              <Input
                label="Kode 6 Digit Authenticator"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                required
                value={twoFactorCode}
                onChange={(e) =>
                  setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                Verifikasi &amp; Masuk
              </Button>

              <button
                type="button"
                onClick={() => {
                  setTwoFactorChallenge(null);
                  setTwoFactorCode("");
                  setErrorMsg(null);
                }}
                className="w-full text-center text-xs font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer"
              >
                Kembali ke form email &amp; kata sandi
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Input
                label="Email"
                type="email"
                required
                autoComplete="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-[#57534E]"
                  >
                    Kata Sandi <span className="text-[#B91C1C]">*</span>
                  </label>
                  <Link
                    href="/lupa-sandi"
                    className="text-xs font-medium text-[#14532D] hover:underline underline-offset-4"
                  >
                    Lupa kata sandi?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Masukkan kata sandi"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 py-2.5 pr-10 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 transition-colors focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword
                        ? "Sembunyikan kata sandi"
                        : "Tampilkan kata sandi"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#78716C] hover:bg-[#EFECE4] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                Masuk
              </Button>
            </form>
          )}

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#E7E2D8]" />
            <span className="text-xs text-[#78716C]">atau</span>
            <div className="h-px flex-1 bg-[#E7E2D8]" />
          </div>

          <div className="space-y-2.5">
            <GoogleAuthButton
              nextPath={nextPath}
              label="Lanjutkan dengan Google"
            />

            <LandingDemoCta
              variant="secondary"
              size="lg"
              nextPath={nextPath}
              label="Masuk dengan Akun Demo (1-Klik)"
              className="w-full"
            />
          </div>

          <p className="mt-6 text-center text-xs sm:text-sm text-[#57534E]">
            Belum punya akun?{" "}
            <Link
              href={daftarHref}
              className="font-semibold text-[#14532D] hover:underline underline-offset-4"
            >
              Daftar gratis
            </Link>
          </p>

          <p className="mt-4 text-center text-[11px] text-[#78716C]">
            <Link href="/kebijakan-privasi" className="hover:underline">
              Kebijakan Privasi
            </Link>{" "}
            ·{" "}
            <Link href="/syarat-ketentuan" className="hover:underline">
              Syarat &amp; Ketentuan
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function MasukPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F5F0] px-4 py-10 flex items-center justify-center">
          <div className="w-full max-w-md">
            <SkeletonCard lines={4} />
          </div>
        </div>
      }
    >
      <MasukForm />
    </Suspense>
  );
}
