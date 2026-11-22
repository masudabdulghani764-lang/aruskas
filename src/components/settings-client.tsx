"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  Info,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Tags,
  Trash2,
  Upload,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuickAdd } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Select,
  cn,
} from "@/components/ui/primitives";
import type { SafeUser } from "@/lib/auth";
import type { CategoryRecord, CategoryType } from "@/lib/categories";
import { formatDateID } from "@/lib/format";

interface SettingsClientProps {
  initialUser: SafeUser;
  initialCategories: CategoryRecord[];
}

const CATEGORY_COLOR_SWATCHES = [
  "#14532D",
  "#15803D",
  "#10b981",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#D97706",
  "#ef4444",
  "#64748b",
] as const;

/**
 * Pengaturan client view covering Profile & Savings Target, Password Security
 * (with Demo account guard), Custom Categories CRUD (with 409 usage guard),
 * JSON/CSV backups, and Demo Data Reset.
 */
export function SettingsClient({
  initialUser,
  initialCategories,
}: SettingsClientProps) {
  const router = useRouter();
  const { refreshTrigger } = useQuickAdd();

  // User & Profile state
  const [user, setUser] = useState<SafeUser>(initialUser);
  const [profileName, setProfileName] = useState(initialUser.name);
  const [savingsTargetInput, setSavingsTargetInput] = useState(
    String(initialUser.monthlySavingsTarget)
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Categories state
  const [categories, setCategories] =
    useState<CategoryRecord[]>(initialCategories);
  const [catTab, setCatTab] = useState<CategoryType>("expense");
  const [catListError, setCatListError] = useState<string | null>(null);

  // Category Create / Edit Modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryRecord | null>(null);
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<CategoryType>("expense");
  const [catColor, setCatColor] = useState<string>(CATEGORY_COLOR_SWATCHES[0]);
  const [savingCat, setSavingCat] = useState(false);
  const [catFormError, setCatFormError] = useState<string | null>(null);

  // Category Delete Modal
  const [deleteCatTarget, setDeleteCatTarget] = useState<CategoryRecord | null>(
    null
  );
  const [deletingCat, setDeletingCat] = useState(false);

  // Demo Reset Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  // Session revocation & Backup restore states
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  // Self-service account deletion state
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(
    null
  );

  const catSeqRef = useRef(0);
  const catAbortRef = useRef<AbortController | null>(null);

  const fetchCategories = useCallback(async () => {
    catAbortRef.current?.abort();
    const controller = new AbortController();
    catAbortRef.current = controller;
    const seq = ++catSeqRef.current;

    try {
      const res = await fetch("/api/categories", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || seq !== catSeqRef.current) {
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal memuat daftar kategori.");
      }
      if (Array.isArray(data.categories)) {
        setCategories(data.categories as CategoryRecord[]);
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        seq !== catSeqRef.current
      ) {
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Gagal memuat daftar kategori."
      );
    }
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      void fetchCategories();
    }
    return () => {
      catAbortRef.current?.abort();
    };
  }, [refreshTrigger, fetchCategories]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "income"),
    [categories]
  );
  const visibleCategories =
    catTab === "expense" ? expenseCategories : incomeCategories;

  // Profile Submit
  async function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileError(null);

    const trimmedName = profileName.trim();
    if (trimmedName.length < 2) {
      setProfileError("Nama minimal 2 karakter.");
      return;
    }

    const parsedTarget = Number(savingsTargetInput.trim());
    if (
      savingsTargetInput.trim() === "" ||
      !Number.isInteger(parsedTarget) ||
      parsedTarget < 0 ||
      parsedTarget > 100
    ) {
      setProfileError(
        "Target rasio menabung harus berupa bilangan bulat antara 0% hingga 100%."
      );
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          monthlySavingsTarget: parsedTarget,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal memperbarui profil.";
        setProfileError(msg);
        toast.error(msg);
        return;
      }

      if (data.user) {
        const updated = data.user as SafeUser;
        setUser(updated);
        setProfileName(updated.name);
        setSavingsTargetInput(String(updated.monthlySavingsTarget));
      }
      toast.success("Profil dan target menabung berhasil disimpan.");
      router.refresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat menyimpan profil.";
      setProfileError(msg);
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  }

  // Password Submit
  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (user.isDemo) {
      return;
    }
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Kata sandi saat ini wajib diisi.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal memperbarui kata sandi.";
        setPasswordError(msg);
        toast.error(msg);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Kata sandi berhasil diperbarui.");
    } catch {
      const msg = "Terjadi gangguan jaringan saat memperbarui kata sandi.";
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  }

  // Category Modal handlers
  function openCreateCategoryModal() {
    setEditingCat(null);
    setCatName("");
    setCatType(catTab);
    setCatColor(CATEGORY_COLOR_SWATCHES[0]);
    setCatFormError(null);
    setCatListError(null);
    setCatModalOpen(true);
  }

  function openEditCategoryModal(category: CategoryRecord) {
    setEditingCat(category);
    setCatName(category.name);
    setCatType(category.type);
    setCatColor(category.color || CATEGORY_COLOR_SWATCHES[0]);
    setCatFormError(null);
    setCatListError(null);
    setCatModalOpen(true);
  }

  async function handleSaveCategory(event: React.FormEvent) {
    event.preventDefault();
    setCatFormError(null);

    const trimmedName = catName.trim();
    if (!trimmedName) {
      setCatFormError("Nama kategori wajib diisi.");
      return;
    }

    setSavingCat(true);
    try {
      const res = await fetch(
        editingCat
          ? `/api/categories/${encodeURIComponent(editingCat.id)}`
          : "/api/categories",
        {
          method: editingCat ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingCat
              ? {
                  name: trimmedName,
                  color: catColor,
                }
              : {
                  name: trimmedName,
                  type: catType,
                  color: catColor,
                  icon: "Tag",
                }
          ),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal menyimpan kategori.";
        setCatFormError(msg);
        toast.error(msg);
        return;
      }

      toast.success(
        editingCat
          ? `Kategori "${trimmedName}" diperbarui.`
          : `Kategori "${trimmedName}" ditambahkan.`
      );
      if (!editingCat) {
        setCatTab(catType);
      }
      setCatModalOpen(false);
      await fetchCategories();
    } catch {
      const msg = "Terjadi gangguan jaringan saat menyimpan kategori.";
      setCatFormError(msg);
      toast.error(msg);
    } finally {
      setSavingCat(false);
    }
  }

  async function handleConfirmDeleteCategory() {
    if (!deleteCatTarget) {
      return;
    }
    setDeletingCat(true);
    setCatListError(null);
    try {
      const res = await fetch(
        `/api/categories/${encodeURIComponent(deleteCatTarget.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error ??
          "Kategori masih digunakan pada data lain dan tidak dapat dihapus.";
        setCatListError(msg);
        setDeleteCatTarget(null);
        toast.error(msg);
        return;
      }

      toast.success(`Kategori "${deleteCatTarget.name}" berhasil dihapus.`);
      setDeleteCatTarget(null);
      await fetchCategories();
    } catch {
      const msg = "Terjadi gangguan jaringan saat menghapus kategori.";
      setCatListError(msg);
      toast.error(msg);
    } finally {
      setDeletingCat(false);
    }
  }

  // Demo Data Reset handler
  async function handleResetDemo() {
    setResettingDemo(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mereset data demo.");
        return;
      }
      toast.success("Data demo berhasil dikembalikan ke kondisi awal.");
      setResetModalOpen(false);
      window.location.reload();
    } catch {
      toast.error("Terjadi gangguan jaringan saat mereset data demo.");
    } finally {
      setResettingDemo(false);
    }
  }

  // Revoke all other sessions handler
  async function handleRevokeOtherSessions() {
    setRevokingSessions(true);
    try {
      const res = await fetch("/api/settings/sessions", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mengeluarkan sesi perangkat lain.");
        return;
      }
      const count = Number(data.revokedCount ?? 0);
      toast.success(
        count > 0
          ? `${count} sesi perangkat lain berhasil dikeluarkan.`
          : "Tidak ada sesi aktif di perangkat lain."
      );
    } catch {
      toast.error("Terjadi gangguan jaringan saat mengelola sesi.");
    } finally {
      setRevokingSessions(false);
    }
  }

  // Restore JSON Backup handler
  async function handleRestoreBackupFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran berkas backup maksimal 5 MB.");
      return;
    }

    setRestoringBackup(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        toast.error("Berkas bukan JSON yang valid.");
        return;
      }

      const res = await fetch("/api/settings/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal memulihkan data backup.");
        return;
      }

      const s = data.summary as {
        walletsImported: number;
        transactionsImported: number;
        budgetsImported: number;
        goalsImported: number;
      };
      toast.success(
        `Backup dipulihkan: ${s.walletsImported} dompet, ${s.transactionsImported} transaksi, ${s.budgetsImported} anggaran, ${s.goalsImported} target.`
      );
      await fetchCategories();
      router.refresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat memulihkan backup.");
    } finally {
      setRestoringBackup(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#78716C]">
          Akun &amp; Preferensi
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Pengaturan
          </h1>
          {user.isDemo && <Badge variant="forest">Akun Demo</Badge>}
        </div>
        <p className="mt-1 text-sm text-[#78716C]">
          Kelola profil, target menabung bulanan, kata sandi, kategori transaksi,
          serta pencadangan data Anda.
        </p>
      </div>

      {/* Row 1: Profile & Security */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profil & Target */}
        <Card padding="md">
          <CardHeader
            serif
            title="Profil & Target Menabung"
            subtitle={
              <>
                Terdaftar sejak{" "}
                <span className="tnum">{formatDateID(user.createdAt)}</span>
              </>
            }
            action={
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#14532D]">
                <UserIcon className="h-4 w-4" />
              </span>
            }
          />

          <form
            onSubmit={handleSaveProfile}
            noValidate
            className="space-y-4"
          >
            {profileError && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
              >
                {profileError}
              </div>
            )}

            <Input
              label="Alamat Email"
              type="email"
              value={user.email}
              disabled
              hint="Alamat email digunakan sebagai identitas masuk akun."
            />

            <Input
              label="Nama Lengkap"
              required
              maxLength={100}
              disabled={savingProfile}
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />

            <div>
              <label
                htmlFor="savings-target-input"
                className="mb-1.5 block text-xs font-medium text-[#57534E]"
              >
                Target Rasio Menabung Bulanan (%){" "}
                <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="relative">
                <input
                  id="savings-target-input"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  disabled={savingProfile}
                  value={savingsTargetInput}
                  onChange={(e) => setSavingsTargetInput(e.target.value)}
                  className="tnum w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-3.5 pr-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#78716C]">
                  %
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#78716C]">
                Rasio ideal yang umum disarankan adalah 20%–30% dari pemasukan
                bulanan.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                loading={savingProfile}
              >
                Simpan Profil
              </Button>
            </div>
          </form>
        </Card>

        {/* Keamanan & Kata Sandi */}
        <Card padding="md">
          <CardHeader
            serif
            title="Keamanan & Kata Sandi"
            subtitle="Perbarui kata sandi akun Anda secara berkala."
            action={
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#14532D]">
                <KeyRound className="h-4 w-4" />
              </span>
            }
          />

          {user.isDemo && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#E7E2D8] bg-[#EFECE4]/70 px-3.5 py-3 text-xs sm:text-sm text-[#57534E]"
            >
              <Info className="h-4 w-4 shrink-0 text-[#14532D] mt-0.5" />
              <span>
                Akun demo dilindungi — perubahan kata sandi dinonaktifkan
              </span>
            </div>
          )}

          <form
            onSubmit={handleChangePassword}
            noValidate
            className="space-y-4"
          >
            {passwordError && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
              >
                {passwordError}
              </div>
            )}

            <Input
              label="Kata Sandi Saat Ini"
              type={showPasswords ? "text" : "password"}
              required
              autoComplete="current-password"
              disabled={user.isDemo || savingPassword}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <Input
              label="Kata Sandi Baru"
              type={showPasswords ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              disabled={user.isDemo || savingPassword}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <Input
              label="Konfirmasi Kata Sandi Baru"
              type={showPasswords ? "text" : "password"}
              required
              autoComplete="new-password"
              disabled={user.isDemo || savingPassword}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={user.isDemo}
                onClick={() => setShowPasswords((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] hover:text-[#1C1917] disabled:opacity-50 cursor-pointer"
              >
                {showPasswords ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Sembunyikan sandi</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>Tampilkan sandi</span>
                  </>
                )}
              </button>

              <Button
                type="submit"
                variant="primary"
                loading={savingPassword}
                disabled={user.isDemo}
              >
                Ubah Kata Sandi
              </Button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E7E2D8] pt-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#1C1917]">
                Sesi Perangkat Aktif
              </p>
              <p className="text-xs text-[#78716C]">
                Keluarkan akun Anda dari browser atau HP lain secara instan.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={revokingSessions}
              onClick={() => void handleRevokeOtherSessions()}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar Perangkat Lain</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* Row 2: Kelola Kategori Kustom */}
      <Card padding="md">
        <CardHeader
          serif
          title="Kelola Kategori Kustom"
          subtitle="Atur label dan warna kategori pemasukan serta pengeluaran Anda."
          action={
            <Button
              size="sm"
              variant="primary"
              onClick={openCreateCategoryModal}
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Kategori</span>
            </Button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Tipe kategori"
            className="inline-flex rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={catTab === "expense"}
              onClick={() => {
                setCatTab("expense");
                setCatListError(null);
              }}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                catTab === "expense"
                  ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                  : "text-[#57534E] hover:text-[#1C1917]"
              )}
            >
              Pengeluaran (
              <span className="tnum">{expenseCategories.length}</span>)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={catTab === "income"}
              onClick={() => {
                setCatTab("income");
                setCatListError(null);
              }}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                catTab === "income"
                  ? "bg-[#FFFFFF] text-[#14532D] font-semibold shadow-2xs"
                  : "text-[#57534E] hover:text-[#1C1917]"
              )}
            >
              Pemasukan (<span className="tnum">{incomeCategories.length}</span>)
            </button>
          </div>
        </div>

        {catListError && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
          >
            <span>{catListError}</span>
            <button
              type="button"
              onClick={() => setCatListError(null)}
              className="text-xs font-semibold underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {visibleCategories.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-5 w-5" />}
            title={`Belum ada kategori ${catTab === "expense" ? "pengeluaran" : "pemasukan"}`}
            description="Tambahkan kategori baru untuk mengelompokkan transaksi Anda lebih rapi."
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={openCreateCategoryModal}
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Kategori</span>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/55 px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1C1917]">
                      {cat.name}
                    </p>
                    <p className="text-[11px] text-[#78716C]">
                      {cat.isDefault ? "Bawaan" : "Kustom"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Edit kategori ${cat.name}`}
                    onClick={() => openEditCategoryModal(cat)}
                    className="rounded-lg p-1.5 text-[#57534E] transition-colors hover:bg-[#EFECE4] hover:text-[#1C1917] cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus kategori ${cat.name}`}
                    onClick={() => setDeleteCatTarget(cat)}
                    className="rounded-lg p-1.5 text-[#B91C1C] transition-colors hover:bg-[#FEE2E2]/60 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Row 3: Backup & Data Demo */}
      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          user.isDemo && "lg:grid-cols-2"
        )}
      >
        <Card padding="md">
          <CardHeader
            serif
            title="Backup & Ekspor Data"
            subtitle="Unduh salinan lengkap data keuangan Anda kapan saja dalam format JSON atau CSV."
            action={
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#14532D]">
                <DatabaseBackup className="h-4 w-4" />
              </span>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/settings/backup"
              download
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#14532D] bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534] whitespace-nowrap"
            >
              <FileJson className="h-4 w-4" />
              <span>Unduh Backup JSON</span>
            </a>

            <a
              href="/api/reports/export/csv?from=2000-01-01&to=2099-12-31"
              download
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4] hover:border-[#D6CFC2] whitespace-nowrap"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#14532D]" />
              <span>Unduh Semua Transaksi CSV</span>
            </a>

            <input
              ref={backupInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void handleRestoreBackupFile(e)}
            />
            <Button
              type="button"
              variant="secondary"
              loading={restoringBackup}
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 text-[#14532D]" />
              <span>Impor / Pulihkan Backup JSON</span>
            </Button>
          </div>

          <p className="mt-3 text-xs text-[#78716C] leading-relaxed">
            Arsip JSON memuat profil, dompet, kategori, transaksi, anggaran,
            target tabungan, dan jadwal rutin milik Anda. File CSV sudah
            dilengkapi BOM UTF-8 agar rapi saat dibuka di Microsoft Excel.
          </p>
        </Card>

        {user.isDemo && (
          <Card padding="md" subtle>
            <CardHeader
              serif
              title="Reset Data Demo"
              subtitle="Kembalikan ruang kerja demo ke data awal 6 bulan terakhir."
              action={
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] text-[#D97706]">
                  <RotateCcw className="h-4 w-4" />
                </span>
              }
            />

            <p className="text-xs sm:text-sm text-[#57534E] leading-relaxed mb-4">
              Semua perubahan transaksi, dompet, anggaran, maupun kategori
              percobaan Anda akan dikembalikan ke skenario bawaan akun demo
              ArusKas.
            </p>

            <Button
              variant="secondary"
              onClick={() => setResetModalOpen(true)}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset Data Demo</span>
            </Button>
          </Card>
        )}

        {/* Zona Bahaya: Hapus Akun Permanen (Khusus Akun Non-Demo) */}
        {!user.isDemo && (
          <Card padding="md" className="border-[#FECACA]">
            <CardHeader
              title="Hapus Akun Permanen"
              subtitle="Hapus seluruh akun, dompet milik sendiri, transaksi, struk, dan catatan terkait secara permanen."
              action={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#B91C1C]">
                  <Trash2 className="h-4 w-4" />
                </span>
              }
            />

            <p className="text-xs sm:text-sm text-[#57534E] leading-relaxed mb-4">
              Disarankan mengunduh salinan <strong>Backup JSON</strong> di atas
              terlebih dahulu sebelum menghapus akun. Tindakan ini bersifat
              permanen dan tidak dapat dibatalkan.
            </p>

            <Button
              variant="danger"
              onClick={() => {
                setDeleteConfirmText("");
                setDeleteAccountPassword("");
                setDeleteAccountError(null);
                setDeleteAccountModalOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span>Hapus Akun Saya</span>
            </Button>
          </Card>
        )}
      </div>

      {/* Modal Tambah / Edit Kategori */}
      <Modal
        open={catModalOpen}
        onClose={() => !savingCat && setCatModalOpen(false)}
        title={editingCat ? "Edit Kategori" : "Tambah Kategori Baru"}
        description="Pilih nama dan warna yang mudah dikenali di buku transaksi serta laporan."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={savingCat}
              onClick={() => setCatModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="category-form"
              variant="primary"
              size="sm"
              loading={savingCat}
            >
              {editingCat ? "Simpan Perubahan" : "Tambah Kategori"}
            </Button>
          </div>
        }
      >
        <form
          id="category-form"
          onSubmit={handleSaveCategory}
          noValidate
          className="space-y-4"
        >
          {catFormError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {catFormError}
            </div>
          )}

          <Select
            label="Jenis Kategori"
            disabled={Boolean(editingCat) || savingCat}
            value={catType}
            onChange={(e) => setCatType(e.target.value as CategoryType)}
          >
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </Select>

          <Input
            label="Nama Kategori"
            required
            maxLength={60}
            placeholder="Contoh: Langganan Internet"
            disabled={savingCat}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#57534E]">
              Warna Kategori
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_COLOR_SWATCHES.map((hex) => {
                const selected = catColor.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Pilih warna ${hex}`}
                    disabled={savingCat}
                    onClick={() => setCatColor(hex)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border transition-transform cursor-pointer",
                      selected
                        ? "scale-110 border-[#1C1917] ring-2 ring-[#14532D]/30"
                        : "border-black/15 hover:scale-105"
                    )}
                    style={{ backgroundColor: hex }}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                );
              })}

              <label className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2D8] bg-[#F7F5F0] px-2 py-1 text-xs text-[#57534E] cursor-pointer">
                <span>Kustom</span>
                <input
                  type="color"
                  aria-label="Warna kustom kategori"
                  disabled={savingCat}
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Kategori */}
      <Modal
        open={Boolean(deleteCatTarget)}
        onClose={() => !deletingCat && setDeleteCatTarget(null)}
        title="Hapus Kategori?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={deletingCat}
              onClick={() => setDeleteCatTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deletingCat}
              onClick={() => void handleConfirmDeleteCategory()}
            >
              Ya, Hapus
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#57534E] leading-relaxed">
          Kategori{" "}
          <strong className="text-[#1C1917]">{deleteCatTarget?.name}</strong>{" "}
          akan dihapus permanen. Kategori yang masih terhubung dengan transaksi,
          anggaran, atau jadwal rutin tidak dapat dihapus.
        </p>
      </Modal>

      {/* Modal Konfirmasi Reset Data Demo */}
      <Modal
        open={resetModalOpen}
        onClose={() => !resettingDemo && setResetModalOpen(false)}
        title="Reset Data Demo ke Kondisi Awal?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={resettingDemo}
              onClick={() => setResetModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={resettingDemo}
              onClick={() => void handleResetDemo()}
            >
              Ya, Reset Data Demo
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#57534E] leading-relaxed">
          Seluruh data transaksi, dompet, anggaran, target, dan kategori pada
          akun demo akan dikembalikan ke baseline awal. Halaman akan dimuat
          ulang setelah proses selesai.
        </p>
      </Modal>

      {/* Modal Konfirmasi Hapus Akun Permanen */}
      <Modal
        open={deleteAccountModalOpen}
        onClose={() => !deletingAccount && setDeleteAccountModalOpen(false)}
        title="Hapus Akun Secara Permanen?"
        description="Semua data keuangan Anda akan dihapus dari database dan tidak dapat dipulihkan."
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setDeleteAccountError(null);
            if (deleteConfirmText.trim().toUpperCase() !== "HAPUS AKUN") {
              setDeleteAccountError('Ketik "HAPUS AKUN" untuk konfirmasi.');
              return;
            }
            setDeletingAccount(true);
            try {
              const res = await fetch("/api/settings/account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  confirmText: deleteConfirmText.trim(),
                  currentPassword: deleteAccountPassword || undefined,
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                const msg = data.error ?? "Gagal menghapus akun.";
                setDeleteAccountError(msg);
                toast.error(msg);
                return;
              }
              toast.success("Akun Anda telah dihapus permanen.");
              router.push("/");
              router.refresh();
            } catch {
              setDeleteAccountError("Terjadi gangguan jaringan.");
            } finally {
              setDeletingAccount(false);
            }
          }}
          noValidate
          className="space-y-4"
        >
          {deleteAccountError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs text-[#B91C1C]"
            >
              {deleteAccountError}
            </div>
          )}

          <Input
            label='Ketik "HAPUS AKUN" untuk konfirmasi'
            required
            placeholder="HAPUS AKUN"
            disabled={deletingAccount}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />

          <Input
            label="Kata Sandi Saat Ini (kosongkan jika akun Google)"
            type="password"
            autoComplete="current-password"
            placeholder="Masukkan kata sandi Anda"
            disabled={deletingAccount}
            value={deleteAccountPassword}
            onChange={(e) => setDeleteAccountPassword(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 border-t border-[#E7E2D8] pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={deletingAccount}
              onClick={() => setDeleteAccountModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={deletingAccount}
            >
              Ya, Hapus Permanen
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
