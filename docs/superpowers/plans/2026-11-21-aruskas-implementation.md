# ArusKas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun **ArusKas**, aplikasi web fullstack laporan keuangan pribadi & keluarga multi-user (uang masuk, uang keluar, transfer, dompet bersama, anggaran, target tabungan, transaksi berulang, laporan grafik, ekspor CSV & cetak PDF) bergaya *Warm Ivory Paper* yang langsung berjalan lokal di Bun.

**Architecture:** Satu aplikasi Next.js 16 (App Router, TypeScript, Tailwind CSS v4) di `aruskas/` dengan lapisan data Drizzle ORM (`drizzle-orm/sqlite-core` + `bun:sqlite` di `data/aruskas.db`), lapisan layanan domain murni (`src/lib/*`) yang diuji penuh dengan `bun test`, API Route Handlers tervalidasi `zod`, dan autentikasi *self-hosted* (`Bun.password` Argon2id + HTTP-only session cookie).

**Tech Stack:** Bun 1.4.4, Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, Drizzle ORM + `bun:sqlite`, Zod, Recharts, Framer Motion, Lucide React, Sonner.

**Spec:** [2026-11-21-aruskas-design.md](file:///c:/Users/Lenovo/Desktop/NEON/aruskas/docs/superpowers/specs/2026-11-21-aruskas-design.md)

## Global Constraints

- Runtime lokal **Bun 1.4.4** (`node`/`npm` tidak ada di PATH; seluruh perintah menggunakan `bun` / `bunx`).
- Database **SQLite-first** (`drizzle-orm/sqlite-core` + `bun:sqlite`) di `data/aruskas.db`, zero API key eksternal, tipe ramah Postgres (UUID text, integer Rupiah penuh `amount > 0`, ISO date `YYYY-MM-DD`), modul `src/db/` terisolasi.
- Seluruh UI, pesan validasi, dan error menggunakan **Bahasa Indonesia** natural; format nominal `Rp 1.250.000` dengan `font-variant-numeric: tabular-nums` wajib di seluruh angka & tabel.
- Estetika **Warm Ivory Paper**: canvas `#F7F5F0`, sheet `#FFFFFF`, border `1px solid #E7E2D8`, secondary `#EFECE4`, ink `#1C1917`/`#57534E`/`#78716C`, aksen `#14532D`, inflow `#15803D`, outflow `#B91C1C`, warning `#D97706`, font `Newsreader` (display) + `Plus Jakarta Sans` (UI).
- Semua endpoint & aksi memverifikasi session (`getCurrentUser()`) dan hak akses `wallet_members` (`owner`/`editor`/`viewer`) — nol IDOR.

## Review Focus

- **Input nominal tidak valid (`amount <= 0`, `NaN`, desimal):** Transaksi/anggaran/target harus menolak dengan HTTP `400` berbahasa Indonesia tanpa mengubah saldo dompet (diuji di Task 4).
- **Transfer ke dompet yang sama atau ke dompet tanpa izin tulis:** Transfer dengan `walletId === targetWalletId` atau ke dompet di mana user berstatus `viewer`/non-anggota harus gagal atomik (`400`/`403`) tanpa mutasi saldo (diuji di Task 4).
- **CSV Formula Injection:** Judul transaksi diawali `=`, `+`, `-`, `@` harus diamankan saat ekspor CSV agar tidak dieksekusi Excel sebagai rumus (diuji di Task 6).
- **Hapus kategori yang masih dipakai transaksi/anggaran:** Menghapus kategori yang masih direferensikan harus mengembalikan HTTP `409` dengan pesan jelas (bukan crash foreign-key `500`) (diuji di Task 5).
- **Token undangan kedaluwarsa atau dipakai ulang:** Membuka/menerima token undangan >7 hari atau yang sudah `acceptedAt != null` harus ditolak bersih (`410`) tanpa membuat duplikat anggota (diuji di Task 3).

---

## File Structure Overview

- `aruskas/package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `drizzle.config.ts` — Konfigurasi project Next.js 16 + Bun + Tailwind v4.
- `aruskas/src/db/schema.ts`, `src/db/index.ts`, `src/db/migrate.ts` — Skema 10 tabel Drizzle (`bun:sqlite`), factory koneksi (mendukung `:memory:` untuk test), dan auto-bootstrap tabel & index.
- `aruskas/src/lib/format.ts` — Format Rupiah, tanggal Indonesia, persentase, helper bulan `YYYY-MM`, dan sanitasi CSV.
- `aruskas/src/lib/auth.ts`, `src/lib/seed.ts` — Hashing Argon2id, manajemen cookie & session DB, seed 12 kategori + dompet awal saat register, serta seed & reset akun demo 6 bulan (`demo@aruskas.id`).
- `aruskas/src/lib/wallets.ts` — CRUD dompet, RBAC `assertWalletAccess`, undangan email & tautan sekali pakai, manajemen anggota.
- `aruskas/src/lib/transactions.ts`, `src/lib/attachments.ts`, `src/lib/recurring.ts` — Mesin saldo atomik (income/expense/transfer), redaksi privasi transfer, upload/validasi bukti nota lokal, serta jadwal transaksi berulang idempoten.
- `aruskas/src/lib/categories.ts`, `src/lib/budgets.ts`, `src/lib/goals.ts` — Kategori kustom, anggaran bulanan + salin bulan lalu, target tabungan dual-mode.
- `aruskas/src/lib/reports.ts`, `src/lib/export.ts` — Agregasi Dashboard, Laporan Arus Kas dengan rekonsiliasi transfer per dompet, ekspor CSV (UTF-8 BOM) & backup JSON.
- `aruskas/src/app/api/**` — Route Handlers RESTful tervalidasi `zod` untuk semua domain di atas.
- `aruskas/src/components/**` — Design system *Warm Ivory Paper*, App Shell, Quick-Add Drawer (`N`), Receipt Detail Drawer, grafik Recharts, dan print layout A4.
- `aruskas/src/app/**` — Halaman `/`, `/masuk`, `/daftar`, `/undangan/[token]`, `/dashboard`, `/transaksi`, `/dompet`, `/anggaran`, `/laporan`, `/pengaturan`.
- `aruskas/tests/*.test.ts` — Suite unit & integration test berbasis `bun test` dengan SQLite in-memory.

---

### Task 1: Project Scaffold, Warm Ivory Paper Tokens, Database Schema & Formatters

**Files:**
- Create: `aruskas/package.json`
- Create: `aruskas/next.config.ts`
- Create: `aruskas/tsconfig.json`
- Create: `aruskas/postcss.config.mjs`
- Create: `aruskas/src/app/globals.css`
- Create: `aruskas/src/db/schema.ts`
- Create: `aruskas/src/db/index.ts`
- Create: `aruskas/src/db/migrate.ts`
- Create: `aruskas/src/lib/format.ts`
- Test: `aruskas/tests/foundation.test.ts`

**Interfaces:**
- Produces:
  - `createDb(dbPath?: string): { db: AppDb; sqlite: Database }` in `src/db/index.ts` and singleton `getDb(): AppDb`
  - `initSchema(sqlite: Database): void` in `src/db/migrate.ts` (creates all 10 tables + unique & partial unique indexes with `PRAGMA foreign_keys = ON`)
  - All 10 Drizzle tables exported from `src/db/schema.ts`: `users`, `sessions`, `wallets`, `walletMembers`, `walletInvites`, `categories`, `transactions`, `budgets`, `savingsGoals`, `recurringRules`
  - `formatIDR(amount: number, opts?: { signed?: boolean }): string`, `formatDateID(isoDate: string): string`, `formatMonthID(ym: string): string`, `escapeCsvCell(value: string | number | null | undefined): string` in `src/lib/format.ts`

- [ ] **Step 1: Scaffold `aruskas/` config files and install dependencies via `bun install`**
  - Create `package.json` (Next.js 16, React 19, Tailwind v4, `@tailwindcss/postcss`, `drizzle-orm`, `zod`, `lucide-react`, `recharts`, `framer-motion`, `sonner`, `clsx`, `tailwind-merge`, `@types/react`, `@types/node`, `typescript`), `next.config.ts` (`images: { unoptimized: true }`), `tsconfig.json` (`@/* -> ./src/*`), `postcss.config.mjs`, and `src/app/globals.css` with exact Warm Ivory Paper CSS tokens + `@media print` A4 stylesheet.
  - Run `bun install` inside `aruskas/`.
- [ ] **Step 2: Write failing tests in `aruskas/tests/foundation.test.ts`**
  - Test `initSchema` creates all 10 tables on `:memory:` SQLite with foreign keys enforced.
  - Test `formatIDR(1250000)` -> `"Rp 1.250.000"`, `formatIDR(-45000, { signed: true })` -> `"-Rp 45.000"`, `formatIDR(45000, { signed: true })` -> `"+Rp 45.000"`.
  - Test `formatDateID("2026-11-21")` -> `"21 Nov 2026"`, `formatMonthID("2026-11")` -> `"November 2026"`.
  - Test `escapeCsvCell("=SUM(A1)")` -> `"'=SUM(A1)"` and `escapeCsvCell('Makan, "Siang"')` -> `'"Makan, ""Siang"""'`.
- [ ] **Step 3: Run test to verify it fails**
  - Run: `bun test tests/foundation.test.ts` (Expected: FAIL — modules not found).
- [ ] **Step 4: Implement `src/db/schema.ts`, `src/db/index.ts`, `src/db/migrate.ts`, and `src/lib/format.ts`**
  - Implement all 10 tables matching Spec Section 6 exactly, including `UNIQUE(wallet_id, user_id)` on `wallet_members`, `UNIQUE(user_id, category_id, month)` on `budgets`, and partial unique index `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_unique ON transactions(recurring_rule_id, occurred_at) WHERE recurring_rule_id IS NOT NULL`.
- [ ] **Step 5: Run test to verify it passes**
  - Run: `bun test tests/foundation.test.ts` (Expected: PASS).

---

### Task 2: Self-Hosted Auth, Sessions, Onboarding Defaults & 1-Click Demo Seeder

**Files:**
- Create: `aruskas/src/lib/auth.ts`
- Create: `aruskas/src/lib/seed.ts`
- Create: `aruskas/src/app/api/auth/register/route.ts`
- Create: `aruskas/src/app/api/auth/login/route.ts`
- Create: `aruskas/src/app/api/auth/logout/route.ts`
- Create: `aruskas/src/app/api/auth/demo/route.ts`
- Create: `aruskas/src/app/api/auth/me/route.ts`
- Create: `aruskas/src/app/api/settings/profile/route.ts`
- Create: `aruskas/src/app/api/settings/password/route.ts`
- Create: `aruskas/src/app/api/demo/reset/route.ts`
- Test: `aruskas/tests/auth.test.ts`

**Interfaces:**
- Consumes: `getDb`, `AppDb`, schema tables from Task 1.
- Produces:
  - `DEMO_EMAIL = "demo@aruskas.id"`, `SESSION_COOKIE_NAME = "aruskas_session"`
  - `registerUser(db: AppDb, input: { name: string; email: string; password: string }): Promise<{ user: SafeUser; token: string }>`
  - `loginUser(db: AppDb, input: { email: string; password: string }): Promise<{ user: SafeUser; token: string }>`
  - `getUserBySessionToken(db: AppDb, rawToken: string): Promise<SafeUser | null>`
  - `getCurrentUser(): Promise<SafeUser | null>` (reads Next.js `cookies()`)
  - `changePassword(db: AppDb, userId: string, currentPassword: string, newPassword: string): Promise<void>` (throws `403` for `DEMO_EMAIL`)
  - `ensureDemoSeeded(db: AppDb): Promise<SafeUser>` and `resetDemoData(db: AppDb): Promise<SafeUser>`

- [ ] **Step 1: Write failing tests in `aruskas/tests/auth.test.ts`**
  - Registering a new user hashes password (never plaintext), returns a valid session token resolved by `getUserBySessionToken`, and seeds 1 wallet (`"Dompet Utama"`) + 12 default Indonesian categories (5 `income`, 7 `expense`).
  - Duplicate email registration throws conflict error (`409`).
  - Login with wrong password fails (`401`); valid login returns session.
  - `ensureDemoSeeded` creates `demo@aruskas.id` with 4 wallets (including 1 shared family wallet with secondary family member `pasangan.demo@aruskas.id`), >= 40 realistic transactions across 6 months, budgets, savings goals, and recurring rules; `changePassword` on demo account throws `403`; `resetDemoData` restores exact baseline cleanly.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `bun test tests/auth.test.ts` (Expected: FAIL).
- [ ] **Step 3: Implement `src/lib/auth.ts`, `src/lib/seed.ts`, and the Auth/Settings API routes**
  - Use `Bun.password.hash(password, { algorithm: "argon2id" })` & `Bun.password.verify`, SHA-256 hash of 32-byte random hex token for `sessions.id`, `HttpOnly; SameSite=Lax; Path=/` cookie with 30-day TTL.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `bun test tests/auth.test.ts` (Expected: PASS).

---

### Task 3: Wallets, Shared Family RBAC & Single-Use Invitation Flow

**Files:**
- Create: `aruskas/src/lib/wallets.ts`
- Create: `aruskas/src/app/api/wallets/route.ts`
- Create: `aruskas/src/app/api/wallets/[id]/route.ts`
- Create: `aruskas/src/app/api/wallets/[id]/invites/route.ts`
- Create: `aruskas/src/app/api/wallets/[id]/members/[userId]/route.ts`
- Create: `aruskas/src/app/api/invites/route.ts`
- Create: `aruskas/src/app/api/invites/[token]/route.ts`
- Create: `aruskas/src/app/api/invites/[token]/accept/route.ts`
- Test: `aruskas/tests/wallets.test.ts`

**Interfaces:**
- Consumes: `AppDb`, schema tables, `SafeUser`, `getCurrentUser` from Tasks 1–2.
- Produces:
  - `assertWalletAccess(db: AppDb, walletId: string, userId: string, minRole: "viewer" | "editor" | "owner"): WalletMembership` (throws `AppError(403 | 404)`)
  - `listUserWallets(db: AppDb, userId: string): WalletWithRole[]`
  - `createWallet(db: AppDb, userId: string, input: CreateWalletInput): WalletWithRole`
  - `updateWallet(db: AppDb, walletId: string, userId: string, input: UpdateWalletInput): WalletWithRole`
  - `createWalletInvite(db: AppDb, walletId: string, ownerId: string, input: { email?: string; role: "editor" | "viewer" }): InviteRecord`
  - `acceptWalletInvite(db: AppDb, token: string, user: SafeUser): { walletId: string; role: "editor" | "viewer" }`
  - `listPendingInvitesForEmail(db: AppDb, email: string): PendingInviteView[]`

- [ ] **Step 1: Write failing tests in `aruskas/tests/wallets.test.ts`**
  - Creating a wallet sets `balance = initialBalance` and inserts `(walletId, ownerId, "owner")` into `wallet_members`.
  - Non-member calling `assertWalletAccess` gets `403`/`404`; `viewer` fails `minRole: "editor"` with `403`; `editor` fails `minRole: "owner"` with `403`.
  - Invite with target `email` appears in `listPendingInvitesForEmail`, rejects wrong user email (`403`), succeeds for matching user and sets `isShared = true` + `acceptedAt`.
  - **Review Focus test:** Reusing an already-accepted invite token OR accepting an expired invite token (>7 days) throws `410` and never creates duplicate `wallet_members`.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `bun test tests/wallets.test.ts` (Expected: FAIL).
- [ ] **Step 3: Implement `src/lib/wallets.ts` and Wallet/Invite API routes**
  - Enforce `owner`-only checks on wallet update/archive, invite creation, and member removal (owner cannot remove themselves).
- [ ] **Step 4: Run test to verify it passes**
  - Run: `bun test tests/wallets.test.ts` (Expected: PASS).

---

### Task 4: Atomic Transactions Engine, Attachments & Recurring Rules

**Files:**
- Create: `aruskas/src/lib/transactions.ts`
- Create: `aruskas/src/lib/attachments.ts`
- Create: `aruskas/src/lib/recurring.ts`
- Create: `aruskas/src/app/api/transactions/route.ts`
- Create: `aruskas/src/app/api/transactions/[id]/route.ts`
- Create: `aruskas/src/app/api/attachments/[transactionId]/route.ts`
- Create: `aruskas/src/app/api/recurring/route.ts`
- Create: `aruskas/src/app/api/recurring/[id]/route.ts`
- Create: `aruskas/src/app/api/recurring/[id]/apply/route.ts`
- Create: `aruskas/src/app/api/recurring/[id]/skip/route.ts`
- Test: `aruskas/tests/transactions.test.ts`

**Interfaces:**
- Consumes: `AppDb`, `assertWalletAccess` from Tasks 1 & 3.
- Produces:
  - `createTransaction(db: AppDb, userId: string, input: CreateTransactionInput): TransactionView`
  - `updateTransaction(db: AppDb, txId: string, userId: string, input: UpdateTransactionInput): TransactionView`
  - `deleteTransaction(db: AppDb, txId: string, userId: string): void`
  - `listTransactions(db: AppDb, userId: string, filters: TransactionFilter): { items: TransactionView[]; summary: { income: number; expense: number; net: number; count: number } }`
  - `saveAttachment(file: { name: string; type: string; buffer: Uint8Array }): Promise<{ path: string; name: string; mime: string }>`
  - `listDueRecurringRules(db: AppDb, userId: string, todayIso?: string): RecurringRuleView[]`
  - `applyRecurringRule(db: AppDb, ruleId: string, userId: string, overrideAmount?: number): TransactionView`
  - `skipRecurringRule(db: AppDb, ruleId: string, userId: string): RecurringRuleView`

- [ ] **Step 1: Write failing tests in `aruskas/tests/transactions.test.ts`**
  - Atomic balance updates: `income` adds, `expense` subtracts, `transfer` subtracts source & adds target; editing amount/type/wallet and deleting reverses exact prior delta with zero drift.
  - Shared wallet rules: `editor` uses `wallet.ownerId` categories, can edit/delete own transaction, gets `403` attempting to edit/delete `owner`'s transaction; `viewer` gets `403` on create.
  - Private transfer counterparty redaction: when `owner` transfers from private wallet to shared wallet, `listTransactions` for shared-wallet member returns `counterpartyWalletName: "Dompet Pribadi (Terkunci)"`.
  - **Review Focus tests:**
    - `amount <= 0`, `NaN`, or float `1500.5` throws validation error (`400`) without changing balance.
    - Transfer with `walletId === targetWalletId` throws `400`; transfer to a wallet where user lacks `editor`/`owner` access throws `403` with zero balance change.
  - Attachment validation rejects unsupported MIME (`application/x-executable`) and >2MB buffer.
  - Recurring rule `applyRecurringRule` posts transaction (honoring `overrideAmount`) and advances `nextRunDate` by 1 week/month; `skipRecurringRule` advances `nextRunDate` without creating a transaction; partial unique index blocks double-posting same `(ruleId, occurredAt)`.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `bun test tests/transactions.test.ts` (Expected: FAIL).
- [ ] **Step 3: Implement `src/lib/transactions.ts`, `src/lib/attachments.ts`, `src/lib/recurring.ts`, and API routes**
  - Wrap every create/update/delete balance mutation in synchronous `db.transaction((tx) => ...)` compatible with `bun:sqlite`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `bun test tests/transactions.test.ts` (Expected: PASS).

---

### Task 5: Categories, Monthly Budgets & Dual-Mode Savings Goals

**Files:**
- Create: `aruskas/src/lib/categories.ts`
- Create: `aruskas/src/lib/budgets.ts`
- Create: `aruskas/src/lib/goals.ts`
- Create: `aruskas/src/app/api/categories/route.ts`
- Create: `aruskas/src/app/api/categories/[id]/route.ts`
- Create: `aruskas/src/app/api/budgets/route.ts`
- Create: `aruskas/src/app/api/budgets/[id]/route.ts`
- Create: `aruskas/src/app/api/budgets/copy/route.ts`
- Create: `aruskas/src/app/api/goals/route.ts`
- Create: `aruskas/src/app/api/goals/[id]/route.ts`
- Create: `aruskas/src/app/api/goals/[id]/deposit/route.ts`
- Test: `aruskas/tests/planning.test.ts`

**Interfaces:**
- Consumes: `AppDb`, `assertWalletAccess`, `createTransaction` from Tasks 1, 3, 4.
- Produces:
  - `listCategories(db: AppDb, userId: string, walletOwnerId?: string): CategoryRecord[]`
  - `deleteCategory(db: AppDb, userId: string, categoryId: string): void` (throws `409` if referenced)
  - `listMonthlyBudgets(db: AppDb, userId: string, month: string): BudgetProgressView[]`
  - `upsertBudget(db: AppDb, userId: string, input: { categoryId: string; month: string; limitAmount: number }): BudgetRecord`
  - `copyBudgetsFromPreviousMonth(db: AppDb, userId: string, targetMonth: string): { copiedCount: number }`
  - `depositToSavingsGoal(db: AppDb, userId: string, goalId: string, input: { amount: number; mode: "wallet_transfer" | "virtual"; sourceWalletId?: string; occurredAt?: string; notes?: string }): SavingsGoalView`

- [ ] **Step 1: Write failing tests in `aruskas/tests/planning.test.ts`**
  - **Review Focus test:** Deleting a category referenced by a transaction throws `409` with Indonesian message mentioning usage count; deleting an unused category succeeds.
  - Budget realization sums only `expense` transactions for that `categoryId` & `month` across wallets where user is `owner` (excludes `transfer` and `viewer` wallets) and sets status `"safe"` (`<80%`), `"warning"` (`80-100%`), `"exceeded"` (`>100%`).
  - `copyBudgetsFromPreviousMonth` copies missing budgets without overwriting existing ones.
  - `depositToSavingsGoal` with `mode: "wallet_transfer"` on a goal linked to `savingsWallet` atomically debits `sourceWallet`, credits `savingsWallet`, inserts a `transfer` transaction, and increments `currentAmount`; `mode: "virtual"` only increments `currentAmount`.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `bun test tests/planning.test.ts` (Expected: FAIL).
- [ ] **Step 3: Implement `src/lib/categories.ts`, `src/lib/budgets.ts`, `src/lib/goals.ts`, and API routes**
- [ ] **Step 4: Run test to verify it passes**
  - Run: `bun test tests/planning.test.ts` (Expected: PASS).

---

### Task 6: Dashboard Aggregation, Financial Reports & CSV/Backup Export

**Files:**
- Create: `aruskas/src/lib/reports.ts`
- Create: `aruskas/src/lib/export.ts`
- Create: `aruskas/src/app/api/dashboard/route.ts`
- Create: `aruskas/src/app/api/reports/route.ts`
- Create: `aruskas/src/app/api/reports/export/csv/route.ts`
- Create: `aruskas/src/app/api/settings/backup/route.ts`
- Test: `aruskas/tests/reports.test.ts`

**Interfaces:**
- Consumes: `AppDb`, `listUserWallets`, `listMonthlyBudgets`, `listDueRecurringRules`, `listPendingInvitesForEmail`, `escapeCsvCell` from Tasks 1–5.
- Produces:
  - `getDashboardSummary(db: AppDb, userId: string, scope?: "all" | "personal"): DashboardSummary`
  - `getFinancialReport(db: AppDb, userId: string, query: { from: string; to: string; walletId?: string; scope?: "all" | "personal" }): FinancialReport`
  - `buildTransactionsCsv(rows: TransactionView[]): string` (UTF-8 BOM `\uFEFF` + Indonesian headers)
  - `buildUserBackupJson(db: AppDb, userId: string): UserBackupPayload`

- [ ] **Step 1: Write failing tests in `aruskas/tests/reports.test.ts`**
  - `getDashboardSummary` excludes `viewer`-only wallets from `totalBalance` and lists them separately under `watchedWallets`; `scope: "personal"` excludes shared wallets.
  - `getFinancialReport` with `walletId` set returns `openingBalance`, `totalIncome`, `totalExpense`, `transferIn`, `transferOut`, `netChange`, `closingBalance` where `openingBalance + totalIncome - totalExpense + transferIn - transferOut === closingBalance`.
  - Aggregate report (`walletId` omitted) excludes internal transfers between user's active wallets from `totalIncome` and `totalExpense`.
  - **Review Focus test:** `buildTransactionsCsv` starts with `\uFEFF`, uses Indonesian column headers, and neutralizes `=HYPERLINK(...)` cell values with leading `'`.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `bun test tests/reports.test.ts` (Expected: FAIL).
- [ ] **Step 3: Implement `src/lib/reports.ts`, `src/lib/export.ts`, and Report/Export API routes**
- [ ] **Step 4: Run test to verify it passes**
  - Run: `bun test tests/reports.test.ts` (Expected: PASS).

---

### Task 7: Warm Ivory Paper UI Kit, App Shell, Quick-Add Drawer, Landing Page & Auth UI

**Files:**
- Create: `aruskas/src/app/layout.tsx`
- Create: `aruskas/src/components/ui/primitives.tsx` (Button, Card, Input, Select, Badge, Modal, Drawer, EmptyState)
- Create: `aruskas/src/components/app-shell.tsx` (TopNav, MobileBottomNav, keyboard shortcut `N`, QuickAdd context)
- Create: `aruskas/src/components/quick-add-modal.tsx` (3-tab Uang Masuk / Uang Keluar / Transfer + optional attachment upload)
- Create: `aruskas/src/app/page.tsx` (Public Landing Page + 1-Click Demo CTA + live editorial preview)
- Create: `aruskas/src/app/(auth)/masuk/page.tsx`
- Create: `aruskas/src/app/(auth)/daftar/page.tsx`
- Create: `aruskas/src/app/undangan/[token]/page.tsx`

**Interfaces:**
- Consumes: All Auth, Wallet, Category, Transaction, Invite API routes from Tasks 2–5.
- Produces: Reusable Warm Ivory Paper UI primitives + `<AppShell>` layout wrapper for Tasks 8–9.

- [ ] **Step 1: Build root layout (`Newsreader` + `Plus Jakarta Sans`, `<Toaster />` from Sonner) and Warm Ivory Paper UI primitives**
- [ ] **Step 2: Build `<AppShell>` (responsive TopNav + MobileBottomNav + `N` shortcut) and `<QuickAddModal>` (3-tab Masuk/Keluar/Transfer)**
- [ ] **Step 3: Build Public Landing Page (`/`), Auth pages (`/masuk`, `/daftar`), and Invite page (`/undangan/[token]`)**
  - Landing page features editorial Warm Ivory Paper typography, live sample cashflow preview card, 4 clear feature pillars, and working **Coba Akun Demo (1-Klik)** button calling `/api/auth/demo`.
- [ ] **Step 4: Verify TypeScript compilation**
  - Run: `bunx tsc --noEmit` (Expected: 0 errors).

---

### Task 8: Core App Views — Dashboard, Buku Transaksi & Dompet Keluarga

**Files:**
- Create: `aruskas/src/app/(app)/layout.tsx` (Server auth guard redirecting unauthenticated users to `/masuk` + wrapping `<AppShell>`)
- Create: `aruskas/src/app/(app)/dashboard/page.tsx`
- Create: `aruskas/src/components/dashboard-client.tsx`
- Create: `aruskas/src/app/(app)/transaksi/page.tsx`
- Create: `aruskas/src/components/transactions-client.tsx`
- Create: `aruskas/src/components/receipt-drawer.tsx`
- Create: `aruskas/src/app/(app)/dompet/page.tsx`
- Create: `aruskas/src/components/wallets-client.tsx`

**Interfaces:**
- Consumes: `<AppShell>`, UI primitives, `<QuickAddModal>` from Task 7 + Dashboard, Transactions, Recurring, Wallets, Invites APIs.

- [ ] **Step 1: Build authenticated `(app)/layout.tsx` and Dashboard (`/dashboard`)**
  - Hero serif Total Saldo card + scope toggle (`Semua Dompet Aktif` / `Dompet Pribadi`), 3 KPI cards, 6-month Recharts cashflow bar comparison chart, top 4 monthly budgets with adaptive progress bars, 6 recent activities, quick wallet cards + separate "Dompet Dipantau" section, recurring due banner (with 1-click Catat/Lewati), and pending family invite banner.
- [ ] **Step 2: Build Buku Transaksi (`/transaksi`) + Receipt-Style Detail Drawer + Transaksi Berulang tab**
  - Combined filter bar (preset/custom dates, type, wallet, category, text search), dynamic filtered totals strip, crisp ledger table (`tabular-nums`), receipt drawer showing pencatat, notes, attachment viewer/download, Edit & Delete actions respecting `owner`/`editor`/`viewer` permissions, plus Recurring Rules management tab.
- [ ] **Step 3: Build Dompet & Keluarga (`/dompet`)**
  - Wallet cards with real-time balances, Create/Edit/Archive modal, Shared Wallet panel (invite by email or generate copyable 7-day link, member list with role badges & remove button), and In-App Pending Invitations inbox with Terima button.
- [ ] **Step 4: Verify TypeScript compilation**
  - Run: `bunx tsc --noEmit` (Expected: 0 errors).

---

### Task 9: Anggaran & Target, Laporan Keuangan (CSV/PDF A4), Pengaturan & End-to-End Verification

**Files:**
- Create: `aruskas/src/app/(app)/anggaran/page.tsx`
- Create: `aruskas/src/components/budgets-goals-client.tsx`
- Create: `aruskas/src/app/(app)/laporan/page.tsx`
- Create: `aruskas/src/components/reports-client.tsx`
- Create: `aruskas/src/app/(app)/pengaturan/page.tsx`
- Create: `aruskas/src/components/settings-client.tsx`

**Interfaces:**
- Consumes: Budgets, Goals, Reports, Export CSV, Categories, Settings, Backup, Demo Reset APIs.

- [ ] **Step 1: Build Anggaran & Target Tabungan (`/anggaran`)**
  - Month picker + "Salin dari Bulan Lalu", budget cards with real-time progress bars & adaptive colors, Add/Edit/Delete budget, plus Savings Goals cards with dual-mode `+ Tambah Setoran` modal (Transfer dari Dompet vs Catat Progres Saja).
- [ ] **Step 2: Build Laporan Keuangan (`/laporan`) with Recharts, CSV Export & `@media print` A4 PDF Layout**
  - Period presets (Bulan Ini, Bulan Lalu, Kuartal Ini, Tahun Ini, Kustom) & wallet selector, Executive Cashflow Statement table (Saldo Awal, Uang Masuk, Uang Keluar, Transfer Masuk/Keluar bila 1 dompet, Perubahan Bersih, Saldo Akhir, Saving Rate), Recharts trend & category breakdown charts + percentage tables, **Ekspor CSV** download button, and **Cetak / Simpan PDF** button producing a clean A4 statement.
- [ ] **Step 3: Build Pengaturan (`/pengaturan`)**
  - Profile & savings ratio target form, password change form (showing protected notice for demo account), Custom Categories manager (Masuk & Keluar), Backup JSON/CSV download, and **Reset Data Demo** button (visible on demo account).
- [ ] **Step 4: Full Verification Gate**
  - Run `bun test` (Expected: all unit & integration suites PASS).
  - Run `bunx tsc --noEmit` (Expected: 0 errors).
  - Run `bun run build` (Expected: clean production build).
  - Start production/dev server in one command and probe `/`, `/masuk`, `/api/auth/demo` -> authenticated `/dashboard`, `/transaksi`, `/dompet`, `/anggaran`, `/laporan`, `/api/reports/export/csv` to verify zero 500s and live end-to-end functionality.
