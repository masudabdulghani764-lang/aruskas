"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ArusKas runtime error:", error);
  }, [error]);

  function handleRetry() {
    try {
      const msg = String(error?.message ?? "").toLowerCase();
      if (
        msg.includes("chunk") ||
        msg.includes("loading") ||
        msg.includes("failed to fetch") ||
        msg.includes("load failed")
      ) {
        window.location.reload();
        return;
      }
      reset();
    } catch {
      window.location.reload();
    }
  }

  return (
    <div className="min-h-screen bg-cream-canvas flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#E3D4BA] bg-gradient-to-br from-[#FFFFFF] via-[#FFFBF2] to-[#F5E6CC] p-8 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FECACA] bg-[#FEE2E2]/70 text-[#B91C1C]">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-2xl font-medium text-[#1C1917]">
          Terjadi Kendala Sementara
        </h1>
        <p className="mt-2 text-sm text-[#57534E] leading-relaxed">
          Data keuangan Anda tetap aman tersimpan di database. Silakan muat
          ulang halaman ini atau kembali ke ringkasan.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-[11px] text-[#78716C]">
            Kode: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534] cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Coba Lagi</span>
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-xl border border-[#E3D4BA] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4]"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
