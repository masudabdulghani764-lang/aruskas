import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Kebijakan Privasi ArusKas mengenai pengumpulan, penyimpanan, keamanan, dan hak pemilik data keuangan pribadi & keluarga.",
};

export default function KebijakanPrivasiPage() {
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
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#CBE0D2] bg-[#EFF6F1] px-3 py-1 text-xs font-semibold text-[#14532D]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Transparansi &amp; Privasi Data</span>
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight text-[#1C1917]">
              Kebijakan Privasi ArusKas
            </h1>
            <p className="text-xs text-[#78716C]">
              Terakhir diperbarui: 22 November 2026
            </p>
          </div>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              1. Data yang Kami Kumpulkan
            </h2>
            <p>
              ArusKas hanya mengumpulkan data yang Anda berikan secara sadar
              untuk menjalankan fitur pencatatan keuangan: nama, alamat email,
              kata sandi terenkripsi (hash Argon2id) atau identitas login Google
              (sub &amp; email terverifikasi), catatan dompet, transaksi,
              anggaran, target tabungan, catatan hutang/piutang, rincian
              patungan, serta lampiran foto struk yang Anda unggah.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              2. Integrasi Notifikasi Bank &amp; E-Wallet Tanpa Kredensial Bank
            </h2>
            <p>
              ArusKas <strong>tidak pernah meminta</strong> username, password,
              PIN, OTP, atau akses langsung ke rekening perbankan Anda. Fitur
              otomatisasi bank &amp; e-wallet bekerja murni dengan membaca teks
              notifikasi atau file CSV mutasi yang Anda kirimkan sendiri melalui
              token webhook pribadi Anda.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              3. Keamanan &amp; Penyimpanan Data
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Semua data disimpan pada database PostgreSQL terenkripsi
                (Neon PostgreSQL) melalui koneksi TLS/HTTPS.
              </li>
              <li>
                Kata sandi di-hash menggunakan algoritma <strong>Argon2id</strong>{" "}
                dan token sesi disimpan sebagai digest SHA-256 dalam cookie{" "}
                <code>HttpOnly</code>.
              </li>
              <li>
                ArusKas tidak menjual, menyewakan, atau membagikan data keuangan
                pribadi Anda kepada pengiklan maupun pihak ketiga.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              4. Dompet Bersama &amp; Tautan Patungan Publik
            </h2>
            <p>
              Jika Anda mengundang anggota keluarga ke Dompet Bersama, anggota
              tersebut hanya dapat melihat transaksi di dompet bersama sesuai
              perannya (Editor atau Pemantau). Jika Anda membuat tautan{" "}
              <strong>Patungan (Split Bill)</strong>, hanya informasi patungan
              terkait (judul, daftar peserta, nominal, dan info transfer yang
              Anda cantumkan) yang dapat dilihat melalui tautan publik tersebut.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[#44403C]">
            <h2 className="text-base font-semibold text-[#1C1917]">
              5. Hak Kendali Penuh Pemilik Data
            </h2>
            <p>
              Anda memegang kendali penuh atas data Anda kapan saja melalui
              halaman <strong>Pengaturan</strong>:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Ekspor &amp; Backup Penuh:</strong> Unduh seluruh data
                dalam format JSON atau CSV kapan saja.
              </li>
              <li>
                <strong>Keluar dari Perangkat Lain:</strong> Cabut semua sesi
                aktif perangkat lain dalam satu klik.
              </li>
              <li>
                <strong>Hapus Akun Permanen:</strong> Hapus akun beserta
                seluruh dompet, transaksi, struk, dan catatan terkait secara
                permanen langsung dari halaman Pengaturan.
              </li>
            </ul>
          </section>

          <div className="border-t border-[#EDE5D6] pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#57534E]">
            <span>Pertanyaan privasi? Hubungi kami melalui Instagram @_ud_ag.</span>
            <Link
              href="/syarat-ketentuan"
              className="font-semibold text-[#14532D] hover:underline"
            >
              Baca Syarat &amp; Ketentuan →
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
