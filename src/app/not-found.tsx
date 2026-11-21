import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream-canvas flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#E3D4BA] bg-gradient-to-br from-[#FFFFFF] via-[#FFFBF2] to-[#F5E6CC] p-8 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E3D4BA] bg-[#FAF0DD] text-[#14532D]">
          <Compass className="h-6 w-6" />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#B45309]">
          Kesalahan 404
        </p>
        <h1 className="font-display mt-1 text-2xl font-medium text-[#1C1917]">
          Halaman Tidak Ditemukan
        </h1>
        <p className="mt-2 text-sm text-[#57534E] leading-relaxed">
          Tautan yang Anda buka mungkin sudah dipindahkan atau tidak tersedia di
          ArusKas.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
          >
            <span>Buka Dashboard</span>
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E3D4BA] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Ke Beranda</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
