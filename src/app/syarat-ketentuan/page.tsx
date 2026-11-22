import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description:
    "Syarat dan Ketentuan penggunaan layanan pencatatan keuangan pribadi dan keluarga ArusKas.",
};

export default function SyaratKetentuanPage() {
  return (
    <div className="min-h-screen bg-cream-canvas px-4 py-10 sm:py-14 text-[#1C1917]">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] hover:text-[#14532D]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Kembali ke Beranda</span>
          </Link>
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-[#14532D]"
          >
            ArusKas<span className="text-[#B45309]">.</span>
          </Link>
        </div>

        <article className="rounded-3xl border border-[#E3D4BA] bg-[#FFFFFF] p-6 sm:p-10 shadow-xs space-y-6">
          <div className="space-y-2 border-b border-[#EDE5D6] pb-5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#EADBC0] bg-[#FDF8EE] px-3 py-1 text-xs font-semibold text-[#92400E]">
              <FileText className="h-3.5 w-3.5" />
              <span>Ketentuan Layanan</span>
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight text-[#1C1917]">
              Syarat &amp; Ketentuan Penggunaan
            </h1>
            <p className="text-xs text-[#78716C]">
              Terakhir diperbarui: 22 November 2026
            </p>
          </div>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              1. Ruang Lingkup Layanan
            </h2>
            <p>
              ArusKas adalah aplikasi web bantu pencatatan arus kas pribadi dan
              keluarga, pengelolaan anggaran, catatan hutang/piutang, serta
              pembagian tagihan patungan. ArusKas bukan lembaga keuangan, bank,
              penasihat investasi, maupun konsultan pajak resmi.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              2. Keamanan Akun &amp; Token Webhook
            </h2>
            <p>
              Anda bertanggung jawab menjaga kerahasiaan kata sandi akun, akses
              akun Google Anda, serta Token Rahasia Webhook untuk otomatisasi
              notifikasi bank. Segera lakukan rotasi token pada halaman Auto Bank
              atau ubah kata sandi apabila Anda mencurigai akses tidak sah.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              3. Penggunaan yang Wajar
            </h2>
            <p>
              Anda setuju untuk tidak menyalahgunakan layanan, tidak mengunggah
              konten ilegal atau berbahaya pada fitur lampiran struk, dan tidak
              melakukan pengujian beban/otomatisasi di luar batas rate-limit
              yang ditetapkan demi menjaga kestabilan layanan bagi seluruh
              pengguna.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              4. Akurasi Data &amp; Pencadangan
            </h2>
            <p>
              Meskipun ArusKas dirancang dengan perhitungan saldo atomik dan
              database PostgreSQL persisten, kami menganjurkan Anda memeriksa
              kembali transaksi hasil otomatisasi notifikasi serta mengunduh
              salinan Backup JSON secara berkala sebagai arsip pribadi.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              5. Penghentian &amp; Penghapusan Akun
            </h2>
            <p>
              Anda dapat berhenti menggunakan layanan dan menghapus akun Anda
              secara permanen kapan saja melalui menu Pengaturan. Penghapusan
              akun bersifat permanen dan tidak dapat dibatalkan.
            </p>
          </section>

          <div className="border-t border-[#EDE5D6] pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#57534E]">
            <span>Dengan menggunakan ArusKas, Anda menyetujui ketentuan ini.</span>
            <Link
              href="/kebijakan-privasi"
              className="font-semibold text-[#14532D] hover:underline"
            >
              Baca Kebijakan Privasi →
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
