"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { Button, Card, Input, SkeletonCard } from "@/components/ui/primitives";
import { resolveSafeNext } from "@/lib/navigation";

function DaftarForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextPath = resolveSafeNext(rawNext);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setErrorMsg("Nama lengkap minimal 2 karakter.");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg("Masukkan alamat email yang valid.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Kata sandi minimal 8 karakter.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal membuat akun.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success("Akun berhasil dibuat! Selamat datang di ArusKas.");
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

  const masukHref = rawNext
    ? `/masuk?next=${encodeURIComponent(nextPath)}`
    : "/masuk";

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
              Buat Akun ArusKas
            </h1>
            <p className="mt-1 text-sm text-[#78716C]">
              Dompet Utama dan 12 kategori bawaan langsung disiapkan untuk Anda.
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

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Nama Lengkap"
              type="text"
              required
              autoComplete="name"
              maxLength={100}
              placeholder="Contoh: Nadia Pratama"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

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
              <label
                htmlFor="register-password"
                className="block text-xs font-medium text-[#57534E]"
              >
                Kata Sandi <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  maxLength={128}
                  placeholder="Minimal 8 karakter"
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
              <p className="text-xs text-[#78716C]">
                Gunakan minimal 8 karakter untuk keamanan akun Anda.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full"
            >
              Daftar &amp; Mulai
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#E7E2D8]" />
            <span className="text-xs text-[#78716C]">atau</span>
            <div className="h-px flex-1 bg-[#E7E2D8]" />
          </div>

          <GoogleAuthButton
            nextPath={nextPath}
            label="Daftar Cepat dengan Google"
          />

          <p className="mt-6 text-center text-xs sm:text-sm text-[#57534E]">
            Sudah punya akun?{" "}
            <Link
              href={masukHref}
              className="font-semibold text-[#14532D] hover:underline underline-offset-4"
            >
              Masuk di sini
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function DaftarPage() {
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
      <DaftarForm />
    </Suspense>
  );
}
