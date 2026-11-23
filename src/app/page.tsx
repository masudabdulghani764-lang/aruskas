import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  HandCoins,
  Instagram,
  Landmark,
  Lock,
  Printer,
  ReceiptText,
  Repeat,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { LandingDemoCta } from "@/components/landing-demo-cta";
import { LandingShowcase } from "@/components/landing-showcase";
import {
  PwaInstallButton,
  PwaInstallShowcaseCard,
} from "@/components/pwa-install-button";
import {
  ScrollProgressAndTopButton,
  ScrollReveal,
} from "@/components/scroll-reveal";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    // Never crash the public landing page on transient DB cold starts or stale cookies
    console.error("LandingPage getCurrentUser fallback:", err);
  }

  return (
    <div className="min-h-screen bg-cream-canvas text-[#1C1917] scroll-smooth">
      <ScrollProgressAndTopButton />

      {/* Sticky Warm Cream-White Top Bar (opaque GPU layer — 60fps scroll safe) */}
      <header className="sticky top-0 z-30 transform-gpu border-b border-[#E3D4BA] bg-gradient-to-r from-[#FFFFFF] via-[#FCF3E2] to-[#F3E2C5]">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="font-display text-2xl font-semibold tracking-tight text-[#14532D]"
            >
              ArusKas<span className="text-[#B45309]">.</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#57534E]">
              <a
                href="#keunggulan"
                className="transition-colors hover:text-[#14532D]"
              >
                Keunggulan
              </a>
              <a
                href="#fitur"
                className="transition-colors hover:text-[#14532D]"
              >
                Fitur Lengkap
              </a>
              <a
                href="#cara-kerja"
                className="transition-colors hover:text-[#14532D]"
              >
                Cara Kerja
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <PwaInstallButton
              variant="header-pill"
              label="Unduh APK"
              className="hidden sm:inline-flex"
            />
            {user ? (
              <>
                <Link
                  href="/masuk"
                  className="inline-flex h-9 items-center rounded-xl px-3 text-xs sm:text-sm font-medium text-[#57534E] transition-colors hover:bg-[#EAE4D8] hover:text-[#1C1917]"
                >
                  Masuk / Ganti Akun
                </Link>
                <Link
                  href="/daftar"
                  className="hidden sm:inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-[#57534E] transition-colors hover:bg-[#EAE4D8] hover:text-[#1C1917]"
                >
                  Daftar
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#14532D] px-4 text-xs sm:text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  <span>Dashboard ({user.name.split(" ")[0]})</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/masuk"
                  className="inline-flex h-9 items-center rounded-xl px-3.5 text-sm font-medium text-[#57534E] transition-colors hover:bg-[#EAE4D8] hover:text-[#1C1917]"
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
          </div>
        </div>
      </header>

      <main>
        {/* BAND 1: Editorial Hero with Warm Cream-to-White Gradient */}
        <section className="relative overflow-hidden border-b border-[#E3D4BA] bg-gradient-to-br from-[#FFFFFF] via-[#FAF0DC] to-[#EED8B5]">
          <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              <ScrollReveal className="lg:col-span-6" delayMs={0} distance={18}>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#EADBC0] bg-[#FDF8EE] px-3.5 py-1 text-xs font-semibold text-[#92400E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B45309]" />
                  <span>Laporan Keuangan Pribadi &amp; Keluarga</span>
                </div>

                <h1 className="font-display mt-5 text-4xl font-medium tracking-tight text-[#1C1917] leading-[1.1] sm:text-5xl lg:text-[54px]">
                  Kelola Arus Kas{" "}
                  <span className="italic text-[#14532D]">dengan Tenang</span>{" "}
                  &amp; Transparan.
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-[#57534E] sm:text-lg">
                  Catat uang masuk, uang keluar, transfer antar dompet, hingga
                  kas bersama keluarga dalam satu lembar kerja yang hangat,
                  jujur pada angka, dan siap cetak laporan A4 kapan saja.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/daftar"
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#14532D] px-5 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                  >
                    <span>Mulai Gratis</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <Link
                    href="/masuk"
                    className="inline-flex h-11 items-center rounded-xl border border-[#D9D1C3] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4]"
                  >
                    Masuk Akun
                  </Link>

                  <LandingDemoCta variant="secondary" size="lg" />

                  <PwaInstallButton
                    variant="gold"
                    label="Download APK Android"
                  />

                  {user && (
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-[#14532D] hover:underline underline-offset-4"
                    >
                      <span>Buka Dashboard Aktif →</span>
                    </Link>
                  )}
                </div>

                {/* Editorial Trust Strip */}
                <div className="mt-8 grid grid-cols-3 gap-3 border-t border-[#E5DFD3] pt-6">
                  <div>
                    <p className="font-display tnum text-xl font-semibold text-[#14532D] sm:text-2xl">
                      100%
                    </p>
                    <p className="mt-0.5 text-xs text-[#78716C]">
                      Saldo atomik anti-selisih
                    </p>
                  </div>
                  <div>
                    <p className="font-display tnum text-xl font-semibold text-[#B45309] sm:text-2xl">
                      3 Peran
                    </p>
                    <p className="mt-0.5 text-xs text-[#78716C]">
                      Pemilik, Editor, Pemantau
                    </p>
                  </div>
                  <div>
                    <p className="font-display tnum text-xl font-semibold text-[#1C1917] sm:text-2xl">
                      CSV &amp; A4
                    </p>
                    <p className="mt-0.5 text-xs text-[#78716C]">
                      Siap Excel &amp; cetak PDF
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              <ScrollReveal className="lg:col-span-6" delayMs={100} distance={24}>
                <LandingShowcase />
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* APP INSTALL SPOTLIGHT CARD */}
        <PwaInstallShowcaseCard />

        {/* BAND 2: Deep Botanical Forest Contrast Strip */}
        <section
          id="keunggulan"
          className="bg-[#113B26] text-[#F7F5F0] py-14 sm:py-16"
        >
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <ScrollReveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E5B869]">
                  Mengapa ArusKas
                </p>
                <h2 className="font-display mt-2 text-2xl font-medium tracking-tight text-[#FAF8F4] sm:text-3xl">
                  Dibangun seperti buku kas sungguhan—presisi di belakang layar,
                  nyaman dilihat setiap hari.
                </h2>
              </div>
              <p className="text-xs text-[#B8D4C5] max-w-sm">
                Tanpa iklan, tanpa tampilan ramai yang melelahkan mata, dan
                data tersimpan aman per akun.
              </p>
            </ScrollReveal>

            <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-3">
              <ScrollReveal delayMs={0}>
                <div className="h-full rounded-2xl border border-[#245A3E] bg-[#17482F] p-6 transition-transform duration-300 hover:-translate-y-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E5B869]/15 text-[#E5B869]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#FAF8F4]">
                    Rekonsiliasi Saldo Otomatis
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#C6DDD0]">
                    Edit nominal, ubah tipe transaksi, atau transfer antar dompet
                    selalu menghitung ulang saldo dalam satu transaksi atomik.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal delayMs={90}>
                <div className="h-full rounded-2xl border border-[#245A3E] bg-[#17482F] p-6 transition-transform duration-300 hover:-translate-y-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#86EFAC]/15 text-[#86EFAC]">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#FAF8F4]">
                    Kolaborasi Keluarga yang Privat
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#C6DDD0]">
                    Undang pasangan lewat email atau tautan sekali pakai. Dompet
                    pribadi Anda tetap tersembunyi walau mentransfer ke kas
                    bersama.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal delayMs={180}>
                <div className="h-full rounded-2xl border border-[#245A3E] bg-[#17482F] p-6 transition-transform duration-300 hover:-translate-y-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FDBA74]/15 text-[#FDBA74]">
                    <Printer className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#FAF8F4]">
                    Laporan Resmi Siap Audit
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#C6DDD0]">
                    Unduh CSV aman untuk Excel Indonesia atau cetak langsung ke
                    PDF berformat kertas A4 lengkap dengan Saldo Awal &amp; Akhir.
                  </p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* BAND 3: Varied Editorial Bento Grid */}
        <section id="fitur" className="bg-cream-canvas py-16 sm:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <ScrollReveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B45309]">
                Fitur Lengkap Siap Pakai
              </p>
              <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-[#1C1917] sm:text-4xl">
                Semua alat untuk memahami ke mana setiap Rupiah mengalir.
              </h2>
            </ScrollReveal>

            <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* Bento 1 (7 cols) - Crisp White + Forest Top Accent */}
              <ScrollReveal className="lg:col-span-7" delayMs={0}>
                <article className="h-full overflow-hidden rounded-2xl border border-[#E2DACB] bg-[#FFFFFF] p-6 sm:p-7 flex flex-col justify-between transition-transform duration-300 hover:-translate-y-0.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#14532D]">
                      <ReceiptText className="h-3.5 w-3.5" />
                      Buku Kas &amp; Struk Digital
                    </span>
                    <span className="rounded-md border border-[#E7E2D8] bg-[#FAF8F4] px-2 py-0.5 font-mono text-[11px] text-[#57534E]">
                      Shortcut: N
                    </span>
                  </div>
                  <h3 className="font-display mt-4 text-2xl font-medium text-[#1C1917]">
                    Catat Uang Masuk, Keluar &amp; Transfer dalam Hitungan Detik
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                    Lampirkan foto struk atau PDF hingga 2MB, tandai metode
                    pembayaran, filter cepat berdasarkan rentang tanggal &amp;
                    kategori, plus jadwal tagihan berulang agar tidak pernah
                    lupa bayar listrik atau cicilan.
                  </p>
                </div>

                {/* Mini receipt strip */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#EFECE4] pt-5">
                  <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] p-3.5">
                    <div className="flex items-center justify-between text-xs text-[#78716C]">
                      <span>Detail Struk</span>
                      <span className="text-[#15803D] font-medium">
                        Terlampir PDF
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-[#1C1917]">
                      Tagihan Listrik &amp; Internet
                    </p>
                    <p className="tnum mt-0.5 text-sm font-semibold text-[#B91C1C]">
                      -Rp 890.000
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#EADBC0] bg-[#FDF8EE] p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#92400E]">
                      <Repeat className="h-3.5 w-3.5" />
                      Pengingat Rutin
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#57534E]">
                      Tagihan jatuh tempo muncul di banner—sesuaikan nominal
                      dulu sebelum dicatat.
                    </p>
                  </div>
                </div>
              </article>
              </ScrollReveal>

              {/* Bento 2 (5 cols) - Warm Ochre Parchment Tint */}
              <ScrollReveal className="lg:col-span-5" delayMs={90}>
                <article className="h-full rounded-2xl border border-[#E8D8BC] bg-[#FDF8EE] p-6 sm:p-7 flex flex-col justify-between transition-transform duration-300 hover:-translate-y-0.5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-3 py-1 text-xs font-semibold text-[#92400E]">
                    <Users className="h-3.5 w-3.5" />
                    Dompet Bersama Keluarga
                  </span>
                  <h3 className="font-display mt-4 text-2xl font-medium text-[#1C1917]">
                    Satu Kas Rumah Tangga, Hak Akses Jelas
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                    Pisahkan dompet pribadi dengan kas keluarga. Setiap anggota
                    punya peran jelas dan histori pencatat tampil transparan.
                  </p>
                </div>

                <div className="mt-6 space-y-2 border-t border-[#E8D8BC]/80 pt-5 text-xs">
                  <div className="flex items-center justify-between rounded-lg bg-[#FFFFFF] px-3 py-2 border border-[#EADBC0]">
                    <span className="font-semibold text-[#1C1917]">Pemilik</span>
                    <span className="text-[#57534E]">
                      Kelola dompet, anggota &amp; semua transaksi
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-[#FFFFFF] px-3 py-2 border border-[#EADBC0]">
                    <span className="font-semibold text-[#14532D]">Editor</span>
                    <span className="text-[#57534E]">
                      Catat &amp; edit transaksi miliknya sendiri
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-[#FFFFFF] px-3 py-2 border border-[#EADBC0]">
                    <span className="font-semibold text-[#92400E]">
                      Pemantau
                    </span>
                    <span className="text-[#57534E]">
                      Lihat laporan kas tanpa mengubah saldo
                    </span>
                  </div>
                </div>
              </article>
              </ScrollReveal>

              {/* Bento 3 (5 cols) - Calm Sage Tint */}
              <ScrollReveal className="lg:col-span-5" delayMs={60}>
                <article className="h-full rounded-2xl border border-[#CBE0D2] bg-[#EFF6F1] p-6 sm:p-7 flex flex-col justify-between transition-transform duration-300 hover:-translate-y-0.5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-3 py-1 text-xs font-semibold text-[#14532D]">
                    <Target className="h-3.5 w-3.5" />
                    Anggaran &amp; Target
                  </span>
                  <h3 className="font-display mt-4 text-2xl font-medium text-[#1C1917]">
                    Jaga Pengeluaran &amp; Wujudkan Dana Darurat
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#47594E]">
                    Salin anggaran bulan lalu dalam satu klik, terima indikator
                    warna otomatis saat menyentuh 80%, dan setor target tabungan
                    langsung dari dompet.
                  </p>
                </div>

                <div className="mt-6 rounded-xl border border-[#CBE0D2] bg-[#FFFFFF] p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1C1917]">
                      Status Anggaran Bulanan
                    </span>
                    <span className="tnum font-semibold text-[#D97706]">
                      84% · Waspada
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                    <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-[#15803D] to-[#D97706]" />
                  </div>
                  <p className="text-[11px] text-[#78716C]">
                    Otomatis berubah hijau → amber → merah sesuai realisasi.
                  </p>
                </div>
              </article>
              </ScrollReveal>

              {/* Bento 4 (7 cols) - Crisp White with Terracotta/Forest Statement Preview */}
              <ScrollReveal className="lg:col-span-7" delayMs={140}>
                <article className="h-full rounded-2xl border border-[#E2DACB] bg-[#FFFFFF] p-6 sm:p-7 flex flex-col justify-between transition-transform duration-300 hover:-translate-y-0.5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFEDD5] border border-[#FED7AA] px-3 py-1 text-xs font-semibold text-[#9A3412]">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Laporan Arus Kas &amp; Ekspor
                  </span>
                  <h3 className="font-display mt-4 text-2xl font-medium text-[#1C1917]">
                    Grafik Tren, Komposisi Kategori, CSV Excel &amp; PDF A4
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                    Filter laporan per bulan, kuartal, tahun, atau rentang
                    kustom—untuk semua dompet maupun satu rekening tertentu
                    lengkap dengan baris rekonsiliasi transfer masuk &amp;
                    keluar.
                  </p>
                </div>

                <div className="mt-6 rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] p-4">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-[#78716C]">Saldo Awal</p>
                      <p className="tnum mt-1 font-semibold text-[#1C1917]">
                        Rp 25.230.000
                      </p>
                    </div>
                    <div>
                      <p className="text-[#78716C]">Perubahan Bersih</p>
                      <p className="tnum mt-1 font-semibold text-[#15803D]">
                        +Rp 6.220.000
                      </p>
                    </div>
                    <div>
                      <p className="text-[#78716C]">Saldo Akhir</p>
                      <p className="font-display tnum mt-0.5 text-base font-semibold text-[#14532D]">
                        Rp 31.450.000
                      </p>
                    </div>
                  </div>
                </div>
              </article>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* BAND 3.5: 5 Fitur Unggulan Terbaru */}
        <section className="border-t border-[#E3D4BA] bg-cream-canvas py-16 sm:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <ScrollReveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B45309]">
                Dirancang Khusus Pengguna Indonesia
              </p>
              <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-[#1C1917] sm:text-4xl">
                Lebih cepat dicatat, lebih tenang dipakai setiap hari.
              </h2>
            </ScrollReveal>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Landmark,
                  badge: "12 Bank & E-Wallet",
                  title: "Auto-Catat Notifikasi Bank & QRIS",
                  desc: "Kenali otomatis notifikasi BCA, Livin' Mandiri, BRImo, Wondr BNI, blu, Bank Jago, SeaBank, GoPay, ShopeePay, OVO, dan DANA — tanpa pernah meminta PIN/password bank.",
                },
                {
                  icon: Sparkles,
                  badge: "Smart Paste 1 Baris",
                  title: "Ketik Bebas Seperti Chat",
                  desc: 'Cukup ketik "Makan Padang 38rb QRIS" atau tempel pesan mutasi di modal Catat Kas — nominal, kategori, tanggal, dan metode pembayaran langsung terisi otomatis.',
                },
                {
                  icon: Target,
                  badge: "Daily Safe-to-Spend",
                  title: "Batas Aman Belanja Hari Ini",
                  desc: "Tahu persis berapa rupiah yang aman dibelanjakan hari ini berdasarkan sisa anggaran bulanan dibagi sisa hari di bulan berjalan, lengkap dengan Mode Privasi.",
                },
                {
                  icon: Share2,
                  badge: "Viral Split Bill",
                  title: "Patungan Instan & Link WhatsApp",
                  desc: "Bagi tagihan makan bareng atau liburan secara rata maupun kustom, lalu bagikan link publik ke grup WhatsApp lengkap nomor rekening dan status lunas per orang.",
                },
                {
                  icon: HandCoins,
                  badge: "Hutang & Piutang",
                  title: "Pantau Cicilan & Pinjaman Teman",
                  desc: "Catat kewajiban hutang maupun piutang, pantau progres pelunasan, dan sinkronkan pembayaran cicilan langsung ke saldo dompet Anda.",
                },
                {
                  icon: ShieldCheck,
                  badge: "Kontrol Penuh",
                  title: "Login Google, Backup JSON & Privasi",
                  desc: "Masuk 1-klik dengan Google atau email terenkripsi Argon2id, backup/restore seluruh data dalam JSON kapan saja, dan hapus akun mandiri tanpa ribet.",
                },
              ].map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <ScrollReveal key={feat.title} delayMs={idx * 60}>
                    <div className="h-full rounded-2xl border border-[#E3D4BA] bg-gradient-to-br from-[#FFFFFF] to-[#F6E8CF] p-6 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#14532D] text-[#FAF0DD]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="rounded-full border border-[#CBE0D2] bg-[#EFF6F1] px-2.5 py-0.5 text-[11px] font-semibold text-[#14532D]">
                          {feat.badge}
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-[#1C1917]">
                        {feat.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                        {feat.desc}
                      </p>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* BAND 4: Warm Sand Linen 3-Step Workflow */}
        <section
          id="cara-kerja"
          className="border-y border-[#E2DACB] bg-[#EFECE4] py-16 sm:py-20"
        >
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <ScrollReveal className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#14532D]">
                Mulai Dalam 2 Menit
              </p>
              <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-[#1C1917]">
                Tiga langkah sederhana merapikan pembukuan harian.
              </h2>
            </ScrollReveal>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  num: "01",
                  title: "Siapkan Dompet & Keluarga",
                  desc: "Saat mendaftar, Dompet Utama dan 12 kategori Indonesia langsung siap. Tambah rekening bank, e-wallet, atau undang pasangan ke kas bersama.",
                  icon: Wallet,
                },
                {
                  num: "02",
                  title: "Catat Masuk, Keluar & Transfer",
                  desc: "Tekan tombol N di mana saja untuk mencatat transaksi, melampirkan foto struk, atau mengonfirmasi tagihan rutin yang jatuh tempo.",
                  icon: ReceiptText,
                },
                {
                  num: "03",
                  title: "Evaluasi & Cetak Laporan",
                  desc: "Lihat tren 6 bulan, pantau batas anggaran kategori, lalu ekspor ke Excel (CSV) atau cetak laporan resmi berformat kertas A4.",
                  icon: FileSpreadsheet,
                },
              ].map((step, idx) => {
                const Icon = step.icon;
                return (
                  <ScrollReveal key={step.num} delayMs={idx * 90}>
                    <div className="h-full rounded-2xl border border-[#DDD5C7] bg-[#FAF8F4] p-6 transition-transform duration-300 hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-display tnum text-3xl font-semibold text-[#B45309]">
                          {step.num}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFECE4] text-[#14532D]">
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-[#1C1917]">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                        {step.desc}
                      </p>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* BAND 5: Deep Forest Closing CTA */}
        <section className="bg-cream-canvas py-16 sm:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <ScrollReveal>
              <div
                className="relative overflow-hidden rounded-3xl border border-[#245A3E] px-6 py-12 text-[#F7F5F0] sm:px-12 sm:py-14"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 92% 12%, rgba(229, 184, 105, 0.22) 0%, rgba(229, 184, 105, 0) 55%), linear-gradient(135deg, #14532D 0%, #113B26 55%, #0D2E1D 100%)",
                }}
              >
              <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E5B869]">
                    Siap Digunakan Sekarang
                  </p>
                  <h2 className="font-display mt-2 text-3xl font-medium tracking-tight text-[#FFFFFF] sm:text-4xl">
                    Mulai rapikan laporan keuangan pribadi &amp; keluarga hari
                    ini.
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#C6DDD0]">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#E5B869]" />
                      Gratis &amp; siap multi-user
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#E5B869]" />
                      Akun demo 6 bulan sekali klik
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {user ? (
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F7F5F0] px-5 text-sm font-semibold text-[#113B26] transition-colors hover:bg-[#FFFFFF]"
                    >
                      <span>Buka Dashboard</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      href="/daftar"
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F7F5F0] px-5 text-sm font-semibold text-[#113B26] transition-colors hover:bg-[#FFFFFF]"
                    >
                      <span>Buat Akun Gratis</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  <LandingDemoCta variant="forest-outline" size="lg" />
                  <PwaInstallButton
                    variant="gold"
                    label="Download APK Android"
                  />
                </div>
              </div>
            </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* Warm Stone Editorial Footer */}
      <footer className="border-t border-[#DDD5C7] bg-[#EAE4D8]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 px-4 py-9 text-xs sm:flex-row sm:items-center sm:px-6 sm:text-sm">
          <div>
            <span className="font-display text-xl font-semibold text-[#14532D]">
              ArusKas<span className="text-[#B45309]">.</span>
            </span>
            <p className="mt-1 text-xs text-[#57534E]">
              Laporan keuangan pribadi &amp; keluarga — tenang, presisi, dan
              siap cetak A4.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#57534E]">
            <a
              href="https://instagram.com/_ud_ag"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram @_ud_ag"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4CBB9] bg-[#FAF8F4] px-3 py-1.5 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#14532D] hover:bg-[#14532D] hover:text-[#FFFFFF] dark:hover:border-[#1E7A45] dark:hover:bg-[#1E7A45] dark:hover:text-[#FFFFFF]"
            >
              <Instagram className="h-3.5 w-3.5" />
              <span>@_ud_ag</span>
            </a>

            <Link
              href="/kebijakan-privasi"
              className="hover:text-[#1C1917] hover:underline underline-offset-4"
            >
              Kebijakan Privasi
            </Link>
            <Link
              href="/syarat-ketentuan"
              className="hover:text-[#1C1917] hover:underline underline-offset-4"
            >
              Syarat &amp; Ketentuan
            </Link>
            <Link
              href="/masuk"
              className="hover:text-[#1C1917] hover:underline underline-offset-4"
            >
              Masuk
            </Link>
            <Link
              href="/daftar"
              className="text-[#14532D] font-semibold hover:underline underline-offset-4"
            >
              Daftar Gratis
            </Link>
            {user && (
              <Link
                href="/dashboard"
                className="text-[#14532D] font-semibold hover:underline underline-offset-4"
              >
                Buka Dashboard
              </Link>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
