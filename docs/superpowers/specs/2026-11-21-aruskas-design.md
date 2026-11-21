# ArusKas — Design Specification

**Tanggal:** 2026-11-21  
**Status:** Approved (Disetujui Pengguna)  
**Target Direktori Project:** `c:\Users\Lenovo\Desktop\NEON\aruskas`

---

## 1. Intent & The Why

Membangun **ArusKas**, aplikasi web fullstack SaaS **laporan keuangan pribadi & keluarga** yang siap digunakan banyak orang (*multi-user*). Pengguna dapat mendaftar akun sendiri, mengelola banyak dompet/rekening, mencatat uang masuk, uang keluar, dan transfer antar dompet secara akurat, memantau anggaran bulanan & target tabungan, berkolaborasi lewat **Dompet Bersama (Shared Wallet)** bersama anggota keluarga, serta menghasilkan laporan keuangan visual yang dapat diekspor ke CSV dan dicetak/simpan sebagai PDF.

Fokus utamanya adalah pengalaman penggunaan yang **tenang, terpercaya, cepat dipahami pengguna non-akuntan, dan bebas dari estetika "AI slop"** (tanpa gradien neon mencolok, tanpa shadow berlebihan, tanpa elemen dekoratif yang mengganggu angka).

---

## 2. Goals, Non-Goals, & Anti-Goals

### Goals
- **Multi-user & Siap Pakai:** Registrasi, login, logout, sesi aman, manajemen profil, dan isolasi data ketat per pengguna/dompet.
- **Pembukuan Uang Masuk, Keluar & Transfer yang Akurat:** Setiap transaksi terhubung ke dompet & kategori, saldo dompet selalu konsisten secara atomik, mendukung catatan, metode pembayaran, dan lampiran bukti struk.
- **Kolaborasi Keluarga (Dompet Bersama):** Pemilik dompet dapat mengundang anggota keluarga (via email atau tautan undangan) dengan peran `owner`, `editor`, atau `viewer`, serta melacak siapa yang mencatat tiap transaksi.
- **Perencanaan Keuangan:** Anggaran bulanan per kategori (dengan indikator peringatan 80% & >100%), target tabungan, dan jadwal transaksi berulang.
- **Laporan Keuangan Lengkap:** Ringkasan arus kas (saldo awal, masuk, keluar, selisih bersih, *saving rate*), grafik tren multi-bulan, komposisi kategori, filter fleksibel, ekspor CSV ramah Excel, dan tampilan cetak/PDF kertas A4 yang rapi.
- **Zero-Config Lokal + Siap Produksi:** Berjalan 100% end-to-end di lokal menggunakan Bun + SQLite tanpa memerlukan API key pihak ketiga, lengkap dengan akun demo kaya data, sekaligus arsitektur Drizzle ORM yang siap beralih ke PostgreSQL (Neon/Supabase) saat deploy.

### Non-Goals
- Integrasi otomatis *Open Banking* / *bank scraping* (mutasi dicatat manual, lewat jadwal berulang, atau impor/ekspor nanti).
- Pembayaran langganan berbayar (Stripe/Midtrans) pada fase pertama.
- Kalkulasi pajak SPT resmi atau akuntansi *double-entry* korporasi (neraca/jurnal umum akuntan).
- Konversi multi-mata-uang real-time (fokus penuh pada **IDR / Rupiah** dengan format lokal Indonesia).

### Anti-Goals
- Estetika "AI slop" (gradien ungu/biru generik, *glow* neon, animasi memantul berlebihan, kartu sesak).
- Saldo dompet yang meleset (*drift*) saat transaksi diedit atau dihapus.
- Kebocoran data (IDOR) antar pengguna atau antar anggota dompet dengan peran berbeda.
- Aplikasi yang gagal jalan atau buntu di halaman login saat dijalankan lokal karena membutuhkan API key eksternal.

---

## 3. Constraints

- **Runtime Lokal:** **Bun 1.4.4** (`node` dan `npm` tidak tersedia di PATH lokal, sehingga instalasi paket, dev server, migrasi DB, dan test dijalankan menggunakan `bun` / `bunx`).
- **Database:** **Drizzle ORM** dibangun *SQLite-first* (`drizzle-orm/sqlite-core` + `bun:sqlite`, file lokal `data/aruskas.db`) untuk eksekusi lokal *zero-config*. *(Keputusan Desain: v1 fokus satu dialek SQLite tanpa abstraksi dual-dialect prematur, dengan tipe data ramah Postgres — UUID text, integer Rupiah, ISO date — dan lapisan `src/db/` terisolasi agar port ke PostgreSQL di masa depan tetap mudah.)*
- **Autentikasi:** *Self-hosted* (email & password dengan hashing `Bun.password` Argon2id, session token acak di-hash SHA-256 dan disimpan di tabel `sessions`, cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` saat produksi).
- **Bahasa & Format:** Seluruh antarmuka menggunakan **Bahasa Indonesia** yang natural & ringkas, format mata uang `Rp 1.250.000` (disimpan sebagai integer Rupiah penuh, bebas error *floating point*), dan format tanggal Indonesia (`21 Nov 2026`).

---

## 4. Approaches Considered

### Pendekatan 1 — Single-App Fullstack Next.js 16 + Drizzle ORM + Self-Hosted Auth *(Dipilih)*
- **Bentuk:** Satu aplikasi Next.js (App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion/motion-primitives) di `aruskas/` yang memuat halaman landing publik, dashboard aplikasi, API routes / Server Actions, Drizzle ORM (`bun:sqlite` lokal / siap Postgres), dan autentikasi self-hosted.
- **Kelebihan:** Langsung jalan 100% lokal di Bun tanpa API key eksternal; nol vendor lock-in; cepat diiterasi dan diuji secara end-to-end; struktur tetap modular dan bersih untuk deploy ke produksi.
- **Trade-off:** Landing page, app, dan API berada dalam satu repo aplikasi (bukan monorepo terpisah).

### Pendekatan 2 — Monorepo Turborepo berbasis `next-forge` / `midday-v1` *(Tidak Dipilih)*
- **Bentuk:** Memisahkan `apps/web`, `apps/app`, `apps/api`, dan `packages/*` menggunakan layanan cloud (Clerk, Supabase, Resend).
- **Trade-off:** Membutuhkan pendaftaran dan konfigurasi banyak API key eksternal sebelum fitur login dan database bisa dijalankan secara lokal, serta menambah kompleksitas build yang belum diperlukan pada tahap ini.

---

## 5. UI/UX Design Direction — "Warm Ivory Paper" *(Dipilih Pengguna)*

Gaya editorial hangat ala *Stripe / Wise / Kinfolk* yang dirancang khusus untuk kenyamanan membaca laporan keuangan pribadi & keluarga.

### Palette & Surface Tokens
- **Canvas Background:** `#F7F5F0` (kertas gading hangat)
- **Elevated Sheet / Card:** `#FFFFFF` dengan garis batas tipis `1px solid #E7E2D8` (tanpa drop shadow tebal)
- **Subtle Secondary Surface:** `#EFECE4` / `#F1EDE4`
- **Primary Ink:** `#1C1917` | **Secondary Ink:** `#57534E` | **Muted Ink:** `#78716C`
- **Primary Accent:** Deep Forest Green `#14532D` (hover `#166534`, soft pill `#DCFCE7`)
- **Semantic Money Flow (disiplin, hanya untuk angka & status finansial):**
  - **Uang Masuk (Inflow):** `#15803D`
  - **Uang Keluar (Outflow):** `#B91C1C` (dan `#D97706` amber hangat untuk peringatan anggaran 80%–100%)
  - **Transfer Internal:** `#44403C`

### Typography & Numerals
- **Display / Brand / Hero Balance:** Serif editorial (`Newsreader` via `next/font/google` dengan fallback `Georgia, serif`)
- **UI & Body:** `Plus Jakarta Sans` (fallback `system-ui, sans-serif`)
- **Wajib `tabular-nums`:** Semua nominal Rupiah, persentase, kolom tabel, dan sumbu grafik wajib menggunakan `font-variant-numeric: tabular-nums` agar deretan angka sejajar vertikal dengan presisi.

### Layout & Interaction Pattern
- **Desktop App Shell:** Top navigation bar bersih (`ArusKas.`, menu `Ringkasan`, `Transaksi`, `Dompet`, `Anggaran`, `Laporan`, tombol utama pill `+ Catat Kas`, dan dropdown profil). Lebar konten maksimal `1200px` dengan ruang napas lega.
- **Mobile Navigation:** Header ringkas + *bottom tab bar* tetap (5 menu utama) dan tombol cepat `+ Catat Kas`.
- **Quick-Add Drawer/Modal:** Dapat dibuka dari halaman mana saja via tombol `+ Catat Kas` atau shortcut keyboard `N`. Memiliki 3 mode tab: **Uang Masuk**, **Uang Keluar**, dan **Transfer**.
- **Receipt-Style Detail Drawer:** Mengklik baris transaksi membuka panel samping bergaya struk rapi yang menampilkan rincian dompet, kategori, pencatat, catatan, lampiran bukti, serta aksi Edit/Hapus.
- **Motion:** Transisi halus 150–200ms (terinspirasi `motion-primitives`), tanpa animasi menghalangi input, menghormati `prefers-reduced-motion`.

---

## 6. Domain Model & Database Schema

Seluruh nominal uang disimpan sebagai `integer` positif dalam Rupiah penuh (`amount > 0`).

1. **`users`**
   - `id` (text UUID PK), `name`, `email` (unique, lowercase), `passwordHash`, `monthlySavingsTarget` (integer, default 0), `createdAt`
2. **`sessions`**
   - `id` (text SHA-256 hash dari cookie token, PK), `userId` (FK -> `users.id` cascade), `expiresAt` (timestamp), `userAgent`, `createdAt`
3. **`wallets`**
   - `id` (text UUID PK), `ownerId` (FK -> `users.id`), `name`, `type` (`'cash' | 'bank' | 'ewallet' | 'savings'`), `initialBalance` (integer), `balance` (integer, selalu ter-update atomik dalam DB transaction), `isShared` (boolean), `archivedAt` (nullable), `createdAt`
4. **`wallet_members`**
   - `id` (text UUID PK), `walletId` (FK -> `wallets.id` cascade), `userId` (FK -> `users.id` cascade), `role` (`'owner' | 'editor' | 'viewer'`), `createdAt`
   - Unique index `(walletId, userId)`. Saat dompet dibuat, pemilik otomatis dicatat sebagai `owner` di `wallet_members`.
5. **`wallet_invites`**
   - `id` (text UUID PK), `walletId` (FK -> `wallets.id` cascade), `createdBy` (FK -> `users.id`), `email` (nullable), `role` (`'editor' | 'viewer'`), `token` (text unique), `expiresAt`, `acceptedAt` (nullable), `createdAt`
6. **`categories`**
   - `id` (text UUID PK), `userId` (FK -> `users.id` cascade), `name`, `type` (`'income' | 'expense'`), `icon`, `color`, `isDefault` (boolean), `createdAt`
   - Di-seed 12 kategori bawaan (5 pemasukan, 7 pengeluaran) otomatis saat user mendaftar.
7. **`transactions`**
   - `id` (text UUID PK), `walletId` (FK -> `wallets.id`), `targetWalletId` (nullable FK -> `wallets.id`, wajib diisi saat `type === 'transfer'`), `categoryId` (nullable FK -> `categories.id`, wajib diisi saat `income` / `expense`), `userId` (FK -> `users.id` — pencatat transaksi), `type` (`'income' | 'expense' | 'transfer'`), `amount` (integer > 0), `title`, `notes` (nullable), `paymentMethod` (nullable), `occurredAt` (ISO date `YYYY-MM-DD` atau timestamp), `attachmentPath` (nullable), `attachmentName` (nullable), `attachmentMime` (nullable), `recurringRuleId` (nullable FK -> `recurring_rules.id`), `createdAt`, `updatedAt`
   - **Aturan Atomik Saldo:**
     - `income`: `wallet.balance += amount`
     - `expense`: `wallet.balance -= amount`
     - `transfer`: `sourceWallet.balance -= amount` dan `targetWallet.balance += amount` (wajib `walletId !== targetWalletId`, user harus punya akses tulis di kedua dompet)
     - Edit & Hapus transaksi selalu mengembalikan efek saldo lama lalu menerapkan efek saldo baru dalam **satu transaksi database atomik**.
     - Laporan pemasukan/pengeluaran mengecualikan tipe `transfer` agar total arus kas tidak terhitung ganda.
     - **Rekonsiliasi & Privasi Transfer *(Keputusan Desain)*:** Saat laporan difilter pada **1 dompet tertentu**, ditampilkan baris rekonsiliasi terpisah (`Transfer Masuk` dan `Transfer Keluar`) sehingga `Saldo Awal + Masuk - Keluar + Transfer Masuk - Transfer Keluar = Saldo Akhir` selalu 100% cocok. Jika pemilik mentransfer dari dompet pribadi ke dompet bersama, API meredaksi nama dompet pribadi bagi anggota lain menjadi `"Dompet Pribadi (Terkunci)"` agar tidak terjadi kebocoran informasi (nol IDOR).
   - **Unique Constraint Transaksi Berulang *(Keputusan Desain)*:** Partial unique index `(recurringRuleId, occurredAt)` saat `recurringRuleId IS NOT NULL` untuk menjamin pencatatan transaksi rutin 100% idempoten.
8. **`budgets`**
   - `id` (text UUID PK), `userId` (FK -> `users.id` cascade), `categoryId` (FK -> `categories.id` cascade), `month` (`YYYY-MM`), `limitAmount` (integer > 0), `createdAt`
   - Unique `(userId, categoryId, month)`.
9. **`savings_goals`**
   - `id` (text UUID PK), `userId` (FK -> `users.id` cascade), `walletId` (nullable FK -> `wallets.id`), `name`, `targetAmount` (integer > 0), `currentAmount` (integer >= 0), `deadline` (nullable `YYYY-MM-DD`), `notes` (nullable), `createdAt`
   - **Mekanisme `+ Tambah Setoran` *(Keputusan Desain)*:** User dapat memilih mode **"Transfer dari Dompet"** (secara atomik membuat transaksi `transfer` dari dompet sumber ke `savingsGoal.walletId` bila terhubung, atau `expense` ke kategori tabungan, sekaligus memperbarui `currentAmount`) atau **"Catat Progres Saja"** (khusus tabungan di luar aplikasi yang hanya memperbarui `currentAmount`).
10. **`recurring_rules`**
    - `id` (text UUID PK), `userId` (FK -> `users.id` cascade), `walletId` (FK -> `wallets.id`), `categoryId` (FK -> `categories.id`), `type` (`'income' | 'expense'`), `amount` (integer > 0), `title`, `frequency` (`'weekly' | 'monthly'`), `nextRunDate` (`YYYY-MM-DD`), `isActive` (boolean), `createdAt`
    - **Eksekusi Jatuh Tempo *(Keputusan Desain)*:** Transaksi rutin yang jatuh tempo **tidak diposting diam-diam saat page load**, melainkan muncul di **Banner Pengingat** dengan tombol **"Catat Sekarang"** (user bisa menyesuaikan nominal lebih dulu untuk tagihan variabel seperti listrik/air) atau **"Lewati Siklus Ini"**. Bila terlewat beberapa siklus, user dapat memproses per siklus dengan `nextRunDate` maju satu siklus tiap kali dikonfirmasi/dilewati.

---

## 6A. Aturan Kolaborasi, Agregasi, Undangan, & Akun Demo *(Keputusan Desain)*

1. **Matriks Izin Dompet Bersama:**
   - `owner`: Akses penuh — edit/arsip dompet, undang & cabut anggota, kelola transaksi berulang, buat/edit/hapus semua transaksi di dompet tersebut.
   - `editor`: Buat transaksi baru (masuk/keluar/transfer antar dompet yang sama-sama bisa ia tulis), edit & hapus **transaksi yang ia catat sendiri** saja. Tidak dapat mengubah info dompet, anggota, atau transaksi milik anggota lain.
   - `viewer`: Hanya baca (lihat saldo, transaksi, bukti nota, dan laporan dompet tersebut).
2. **Kategori & Cakupan Agregasi Dompet Bersama:**
   - Transaksi pada Dompet Bersama selalu menggunakan **daftar kategori milik Pemilik Dompet (`wallet.ownerId`)** agar laporan kategori & anggaran bersama tidak terpecah atau duplikat.
   - Pada Dashboard & Laporan pribadi, agregasi default menghitung **semua dompet milik sendiri + dompet bersama berstatus `owner`/`editor`**, disertai filter cepat (`Semua Dompet Aktif` / `Dompet Pribadi Saja` / dompet spesifik). Dompet dengan peran `viewer` ditampilkan di bagian terpisah **"Dompet Dipantau"** agar tidak menggelembungkan total saldo pribadi pengguna.
   - Realisasi **Anggaran Bulanan** menghitung pengeluaran dari dompet milik sendiri (dan dompet bersama di mana user adalah `owner`) yang cocok dengan `categoryId` anggaran.
3. **Alur Undangan Tanpa Layanan Email Eksternal:**
   - Undangan berdasarkan email yang sudah terdaftar otomatis muncul di **Kotak Undangan In-App** pada halaman `/dompet` (dan banner di Dashboard), sekaligus menghasilkan tautan `/undangan/[token]` yang bisa disalin.
   - Tautan undangan bersifat **sekali pakai (*single-use*)**, berlaku 7 hari, dan memverifikasi kecocokan email bila undangan ditujukan ke email tertentu (jika belum punya akun, pengguna diarahkan mendaftar dulu lalu otomatis bergabung).
4. **Akun Demo 1-Klik (`demo@aruskas.id`):**
   - Menggunakan 1 akun demo kaya data (6 bulan transaksi, 4 dompet termasuk 1 contoh Dompet Bersama Keluarga, anggaran, target tabungan, dan jadwal rutin) yang di-seed otomatis.
   - Untuk mencegah akun demo terkunci oleh pengunjung lain, fitur **ubah email & ubah password dinonaktifkan khusus akun demo**, dan disediakan tombol **"Reset Data Demo"** di halaman `/pengaturan` untuk mengembalikan data demo ke kondisi awal kapan saja.

---

## 7. Halaman & Fitur Utama

1. **Landing Page Publik (`/`)**
   - Hero editorial menjelaskan ArusKas, pratinjau interaktif ringkasan laporan keuangan, 4 pilar fitur utama, dan tombol **Mulai Gratis**, **Masuk**, serta **Coba Akun Demo (1-Klik)** yang langsung login ke akun demo berisi riwayat transaksi realistis 6 bulan terakhir.
2. **Autentikasi (`/masuk`, `/daftar`)**
   - Validasi jelas, pesan error ramah Bahasa Indonesia, redirect otomatis ke `/dashboard` (atau kembali ke `/undangan/[token]` bila datang dari tautan undangan keluarga).
3. **Dashboard Ringkasan (`/dashboard`)**
   - Kartu Saldo Gabungan (gaya hero serif) + persentase perubahan bulan ini vs bulan lalu.
   - 3 KPI: Uang Masuk bulan ini, Uang Keluar bulan ini, Selisih Bersih & *Saving Rate*.
   - Grafik perbandingan Uang Masuk vs Uang Keluar 6 bulan terakhir.
   - Ringkasan Anggaran Bulan Ini (top 4 kategori dengan progress bar warna adaptif).
   - Daftar 6 Aktivitas Terbaru + kartu saldo cepat tiap dompet.
   - Banner pengingat jika ada transaksi rutin jatuh tempo.
4. **Buku Transaksi (`/transaksi`)**
   - Filter gabungan: rentang tanggal (Bulan Ini, Bulan Lalu, 3 Bulan, Tahun Ini, Kustom), Tipe, Dompet, Kategori, dan pencarian judul/catatan.
   - Bar ringkasan dinamis (Total Masuk, Total Keluar, Selisih) sesuai filter yang aktif.
   - Tabel transaksi rapi dengan pengelompokan/tanggal jelas, panel detail bergaya struk, edit/hapus, dan upload/preview bukti nota (opsional, gambar/PDF maks 2MB).
   - Tab/modal manajemen **Transaksi Berulang** (gaji bulanan, cicilan, listrik, langganan).
5. **Dompet & Keluarga (`/dompet`, `/undangan/[token]`)**
   - Kelola dompet (Tunai, Bank, E-Wallet, Tabungan), lihat total masuk/keluar per dompet, tambah/edit/arsipkan dompet.
   - Panel **Dompet Bersama**: buat tautan undangan atau undang via email, tentukan peran (`Editor` / `Viewer`), lihat daftar anggota, dan cabut akses kapan saja.
6. **Anggaran & Target Tabungan (`/anggaran`)**
   - Atur batas anggaran per kategori untuk bulan terpilih, lihat realisasi vs batas secara real-time, fitur "Salin dari Bulan Lalu".
   - Kelola **Target Tabungan** (Dana Darurat, DP Rumah, Pendidikan, dll.) dengan progress bar dan aksi cepat **+ Tambah Setoran**.
7. **Laporan Keuangan (`/laporan`)**
   - Pilih periode (Bulanan, Kuartalan, Tahunan, Rentang Kustom) & filter dompet (Semua / spesifik).
   - Laporan Arus Kas lengkap: Saldo Awal Periode, Total Uang Masuk, Total Uang Keluar, Perubahan Bersih, Saldo Akhir, dan *Saving Rate*.
   - Visualisasi: Grafik Tren Arus Kas + Breakdown Kategori Pemasukan & Pengeluaran (grafik + tabel nominal & persentase).
   - **Ekspor CSV** (UTF-8 BOM agar langsung rapi di Excel) & **Cetak / Simpan PDF** (`window.print()` dengan stylesheet `@media print` bersih khusus format laporan A4 tanpa navbar/tombol).
8. **Pengaturan (`/pengaturan`)**
   - Edit nama/profil & target rasio menabung, ganti password, kelola kategori pemasukan/pengeluaran kustom (tambah/edit/hapus), dan unduh backup data lengkap (JSON/CSV).

---

## 8. Keamanan & Privasi

- Semua endpoint API dan mutasi server memverifikasi sesi via `getCurrentUser()`.
- Otorisasi berbasis kepemilikan & keanggotaan `wallet_members` diperiksa pada setiap baca/tulis dompet, transaksi, dan unduhan lampiran (mencegah IDOR).
- Peran `viewer` hanya diizinkan membaca transaksi & laporan dompet bersama; ditolak dengan HTTP `403` untuk segala mutasi.
- Input divalidasi dengan `zod` di sisi server; file lampiran divalidasi MIME & ukuran (maks 2MB), disimpan dengan UUID acak di folder non-publik `data/uploads/`, dan diakses lewat `/api/attachments/[transactionId]` yang mengecek hak akses dompet.
- Cookie sesi menggunakan `HttpOnly` + `SameSite=Lax`; password tidak pernah dikembalikan ke client.

---

## 9. Diserahkan ke Builder (Implementation Details)

- Pemilihan library chart (`recharts` atau komponen SVG interaktif responsif yang cocok dengan Next.js 16 + React 19).
- Penataan struktur direktori internal di dalam `aruskas/src/` (`app/`, `components/`, `db/`, `lib/`).
- Strategi seed data demo realistis (6 bulan transaksi, beberapa dompet, anggaran, target tabungan, dan contoh dompet bersama).
- Pengaturan unit & integration test dengan `bun test` untuk logika atomik saldo, otorisasi dompet bersama, kalkulasi laporan, dan format ekspor CSV.
