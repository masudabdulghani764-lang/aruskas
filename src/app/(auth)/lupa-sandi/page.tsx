"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/ui/primitives";

export default function LupaSandiPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Masukkan alamat email yang valid.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal memproses permintaan reset kata sandi.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }
      setSentMessage(
        data.message ??
          "Jika email terdaftar, tautan reset kata sandi telah dikirim."
      );
      toast.success("Permintaan reset kata sandi diproses.");
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
            <span>Kembali ke Masuk</span>
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
              Lupa Kata Sandi?
            </h1>
            <p className="mt-1 text-sm text-[#78716C]">
              Masukkan email akun ArusKas Anda. Kami akan mengirimkan tautan
              untuk mengatur ulang kata sandi (berlaku 30 menit).
            </p>
          </div>

          {sentMessage ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7]/50 p-4 text-xs sm:text-sm text-[#14532D]">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-[#15803D]" />
                <p className="leading-relaxed">{sentMessage}</p>
              </div>
              <Link
                href="/masuk"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#14532D] px-4 text-sm font-semibold text-[#FFFFFF] hover:bg-[#166534]"
              >
                Kembali ke Halaman Masuk
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

              <Input
                label="Email Terdaftar"
                type="email"
                required
                autoComplete="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                <Mail className="h-4 w-4" />
                <span>Kirim Tautan Reset</span>
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
