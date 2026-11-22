"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, SkeletonCard } from "@/components/ui/primitives";

function ResetSandiForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!token) {
      setErrorMsg("Tautan reset kata sandi tidak lengkap atau tidak valid.");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal mengatur ulang kata sandi.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      setDone(true);
      toast.success("Kata sandi baru berhasil disimpan!");
      setTimeout(() => router.push("/masuk"), 1800);
    } catch {
      const msg = "Terjadi gangguan jaringan. Silakan coba lagi.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-canvas px-4 py-10 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/masuk"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] hover:text-[#1C1917]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Halaman Masuk</span>
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
              Atur Ulang Kata Sandi
            </h1>
            <p className="mt-1 text-sm text-[#78716C]">
              Buat kata sandi baru minimal 8 karakter. Semua sesi perangkat lain
              akan otomatis keluar demi keamanan.
            </p>
          </div>

          {done ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7]/50 p-4 text-sm text-[#14532D]">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-[#15803D]" />
                <p>
                  Kata sandi berhasil diperbarui! Mengarahkan ke halaman masuk...
                </p>
              </div>
              <Link
                href="/masuk"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#14532D] px-4 text-sm font-semibold text-[#FFFFFF]"
              >
                Masuk Sekarang
              </Link>
            </div>
          ) : !token ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-3 text-xs sm:text-sm text-[#B91C1C]">
                Tautan reset kata sandi tidak ditemukan atau sudah kedaluwarsa.
              </div>
              <Link
                href="/lupa-sandi"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#14532D] px-4 text-sm font-semibold text-[#FFFFFF]"
              >
                Minta Tautan Reset Baru
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
                >
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="new-password"
                  className="block text-xs font-medium text-[#57534E]"
                >
                  Kata Sandi Baru <span className="text-[#B91C1C]">*</span>
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Minimal 8 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 py-2.5 pr-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#78716C] hover:bg-[#EFECE4] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-medium text-[#57534E]"
                >
                  Konfirmasi Kata Sandi Baru{" "}
                  <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Ulangi kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                <KeyRound className="h-4 w-4" />
                <span>Simpan Kata Sandi Baru</span>
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ResetSandiPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream-canvas px-4 py-10 flex items-center justify-center">
          <div className="w-full max-w-md">
            <SkeletonCard lines={4} />
          </div>
        </div>
      }
    >
      <ResetSandiForm />
    </Suspense>
  );
}
