import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Target,
  Users,
} from "lucide-react";
import { LandingDemoCta } from "@/components/landing-demo-cta";
import { getCurrentUser } from "@/lib/auth";
import { formatIDR } from "@/lib/format";

export const dynamic = "force-dynamic";

const FEATURE_PILLARS = [
  {
    title: "Pencatatan Masuk & Keluar Presisi",
    description:
      "Catat pemasukan, pengeluaran, dan transfer antar dompet dengan pembaruan saldo atomik, lampiran nota, serta pengingat tagihan berulang.",
    icon: ArrowLeftRight,
  },
  {
    title: "Dompet Bersama Keluarga",
    description:
      "Kelola kas rumah tangga bersama pasangan atau anggota keluarga dengan peran Pemilik, Editor, dan Pemantau sambil menjaga privasi dompet pribadi.",
    icon: Users,
  },
  {
    title: "Anggaran & Target Tabungan",
    description:
      "Tetapkan batas anggaran bulanan per kategori dengan peringatan 80% serta lacak progres dana darurat atau tujuan tabungan secara terukur.",
    icon: Target,
  },
  {
    title: "Laporan Visual + CSV/PDF A4",
    description:
      "Pantau saldo awal hingga saldo akhir, rasio menabung, grafik tren 6 bulan, ekspor CSV siap buka di Excel, dan cetak PDF berformat kertas A4.",
    icon: FileSpreadsheet,
  },
] as const;

const SAMPLE_TRANSACTIONS = [
  {
    title: "Gaji Bulanan",
    meta: "BCA Utama · 1 Nov 2026",
    amount: formatIDR(14_500_000, { signed: true }),
    amountColor: "text-[#15803D]",
    tag: "Pemasukan",
  },
  {
    title: "Belanja Mingguan Pasar & Dapur",
    meta: "Kas Rumah Tangga (Bersama) · 14 Nov 2026",
    amount: formatIDR(-645_000, { signed: true }),
    amountColor: "text-[#B91C1C]",
    tag: "Pengeluaran",
  },
  {
    title: "Setoran Dana Darurat",
    meta: "BCA Utama → Tabungan · 18 Nov 2026",
    amount: formatIDR(2_500_000),
    amountColor: "text-[#44403C]",
    tag: "Transfer",
  },
] as const;

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917]">
      {/* Top Bar */}
      <header className="border-b border-[#E7E2D8] bg-[#FFFFFF]/90 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-[#14532D]"
          >
            ArusKas.
          </Link>

          <nav className="flex items-center gap-2.5 sm:gap-3">
            {user ? (
              <>
                <span className="hidden sm:inline text-xs text-[#78716C]">
                  Masuk sebagai{" "}
                  <strong className="font-medium text-[#1C1917]">
                    {user.name}
                  </strong>
                </span>
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#14532D] px-4 text-xs sm:text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  <span>Buka Dashboard</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/masuk"
                  className="inline-flex h-9 items-center rounded-xl px-3.5 text-sm font-medium text-[#57534E] transition-colors hover:bg-[#EFECE4] hover:text-[#1C1917]"
                >
                  Masuk
                </Link>
                <Link
                  href="/daftar"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  <span>Mulai Gratis</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E7E2D8] bg-[#FFFFFF] px-3 py-1 text-xs font-medium text-[#57534E]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#14532D]" />
              <span>Laporan Keuangan Pribadi & Keluarga</span>
            </div>

            <h1 className="font-display mt-5 text-4xl font-medium tracking-tight text-[#1C1917] leading-[1.12] sm:text-5xl">
              Kelola Arus Kas Pribadi &amp; Keluarga dengan Tenang.
            </h1>

            <p className="mt-5 text-base leading-relaxed text-[#57534E] sm:text-lg">
              Pembukuan harian yang rapi, jujur terhadap angka, dan nyaman
              dibaca. Pantau seluruh dompet, kas bersama keluarga, anggaran
              bulanan, hingga laporan cetak A4 dalam satu ruang kerja hangat.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#14532D] px-5 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  <span>Buka Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/daftar"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#14532D] px-5 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  <span>Mulai Gratis</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}

              <LandingDemoCta variant="secondary" size="lg" />

              {!user && (
                <Link
                  href="/masuk"
                  className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-[#57534E] transition-colors hover:bg-[#EFECE4] hover:text-[#1C1917]"
                >
                  Masuk
                </Link>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#78716C]">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#14532D]" />
                Akun demo siap pakai dengan data 6 bulan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#14532D]" />
                Format Rupiah presisi &amp; ekspor CSV/PDF
              </span>
            </div>
          </div>

          {/* Right-side Warm Ivory Paper Statement Showcase Card */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-[#E7E2D8] bg-[#FFFFFF] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E2D8] pb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[#78716C]">
                    Pratinjau Lembar Keuangan
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1C1917]">
                    Periode November 2026
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#BBF7D0] bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-medium text-[#14532D] tnum">
                  Rasio Tabungan 34%
                </span>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium text-[#78716C]">
                  Total Saldo Aktif (4 Dompet)
                </p>
                <p className="font-display tnum mt-1 text-3xl font-medium tracking-tight text-[#1C1917] sm:text-4xl">
                  {formatIDR(31_450_000)}
                </p>
                <p className="mt-1 text-xs text-[#78716C]">
                  Termasuk Kas Rumah Tangga bersama pasangan · +8,4% dari bulan
                  lalu
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-3.5">
                  <p className="text-xs text-[#78716C]">Uang Masuk</p>
                  <p className="tnum mt-1 text-base font-semibold text-[#15803D] sm:text-lg">
                    {formatIDR(18_200_000, { signed: true })}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-3.5">
                  <p className="text-xs text-[#78716C]">Uang Keluar</p>
                  <p className="tnum mt-1 text-base font-semibold text-[#B91C1C] sm:text-lg">
                    {formatIDR(-11_980_000, { signed: true })}
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-[#E7E2D8] pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
                    Aktivitas Terbaru
                  </p>
                  <span className="text-xs text-[#78716C]">Rekonsiliasi 100%</span>
                </div>

                <ul className="divide-y divide-[#E7E2D8]">
                  {SAMPLE_TRANSACTIONS.map((item) => (
                    <li
                      key={item.title}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#1C1917]">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-[#78716C] tnum">
                          {item.meta}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`tnum text-sm font-semibold ${item.amountColor}`}
                        >
                          {item.amount}
                        </p>
                        <p className="text-[11px] text-[#78716C]">{item.tag}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/55 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#1C1917]">
                    Anggaran Makanan &amp; Minuman
                  </span>
                  <span className="tnum font-medium text-[#15803D]">
                    74% terpakai
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E7E2D8]">
                  <div className="h-full w-[74%] rounded-full bg-[#15803D]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Feature Pillars */}
        <section className="mt-16 border-t border-[#E7E2D8] pt-14 sm:mt-20 sm:pt-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#14532D]">
              Empat Pilar Utama
            </p>
            <h2 className="font-display mt-2 text-2xl font-medium tracking-tight text-[#1C1917] sm:text-3xl">
              Dirancang agar catatan keuangan keluarga selalu selaras dan
              mudah diaudit.
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article
                  key={pillar.title}
                  className="flex flex-col rounded-2xl border border-[#E7E2D8] bg-[#FFFFFF] p-5 sm:p-6 transition-colors hover:border-[#D4CCC0]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 text-[#14532D]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#1C1917] leading-snug">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                    {pillar.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {/* Clean Editorial Footer */}
      <footer className="border-t border-[#E7E2D8] bg-[#FFFFFF]/60">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 px-4 py-8 text-xs sm:flex-row sm:items-center sm:px-6 sm:text-sm">
          <div>
            <span className="font-display text-lg font-semibold text-[#14532D]">
              ArusKas.
            </span>
            <p className="mt-1 text-xs text-[#78716C]">
              Laporan keuangan pribadi &amp; keluarga — tenang, presisi, dan
              siap cetak.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#57534E]">
            {user ? (
              <Link
                href="/dashboard"
                className="text-[#14532D] hover:underline underline-offset-4"
              >
                Buka Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/masuk"
                  className="hover:text-[#1C1917] hover:underline underline-offset-4"
                >
                  Masuk
                </Link>
                <Link
                  href="/daftar"
                  className="text-[#14532D] hover:underline underline-offset-4"
                >
                  Mulai Gratis
                </Link>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
