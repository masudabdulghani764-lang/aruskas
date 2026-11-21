"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  Check,
  Copy,
  Eye,
  Landmark,
  Link2,
  Mail,
  PiggyBank,
  Plus,
  Settings2,
  Smartphone,
  UserMinus,
  UserPlus,
  Users,
  Wallet as WalletIcon,
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
  SkeletonCard,
  cn,
} from "@/components/ui/primitives";
import { formatDateID, formatIDR } from "@/lib/format";
import type {
  InviteRecord,
  PendingInviteView,
  WalletRole,
  WalletType,
  WalletWithRole,
} from "@/lib/wallets";

function getWalletTypeMeta(type: WalletType) {
  switch (type) {
    case "bank":
      return { label: "Bank", icon: Landmark };
    case "ewallet":
      return { label: "E-Wallet", icon: Smartphone };
    case "savings":
      return { label: "Tabungan", icon: PiggyBank };
    case "cash":
    default:
      return { label: "Tunai", icon: Banknote };
  }
}

function getRoleMeta(role: WalletRole) {
  if (role === "owner") {
    return { label: "Pemilik", variant: "forest" as const };
  }
  if (role === "editor") {
    return { label: "Editor", variant: "inflow" as const };
  }
  return { label: "Pemantau", variant: "neutral" as const };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "AK";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatDigitsAllowZero(digits: string): string {
  if (!digits) {
    return "";
  }
  if (digits === "0") {
    return "0";
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function sanitizeDigitsAllowZero(raw: string): string {
  const onlyDigits = raw.replace(/\D/g, "");
  if (!onlyDigits) {
    return "";
  }
  const stripped = onlyDigits.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/**
 * Dompet & Keluarga client view with incoming invitations, active & watched wallet grids,
 * create wallet modal, and owner-only wallet & family member management modal.
 */
export function WalletsClient({
  currentUserId,
  initialWallets,
  initialInvites,
}: {
  currentUserId: string;
  initialWallets?: WalletWithRole[];
  initialInvites?: PendingInviteView[];
}) {
  const { openQuickAdd, refreshTrigger, triggerRefresh } = useQuickAdd();

  const hasInitialData = initialWallets !== undefined;
  const [wallets, setWallets] = useState<WalletWithRole[]>(initialWallets ?? []);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteView[]>(
    initialInvites ?? []
  );
  const [loading, setLoading] = useState(!hasInitialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);

  // Create Wallet Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<WalletType>("bank");
  const [newBalanceDigits, setNewBalanceDigits] = useState("0");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Manage Wallet & Family Modal (Owner only)
  const [manageWalletId, setManageWalletId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<WalletType>("cash");
  const [savingWallet, setSavingWallet] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archivingWallet, setArchivingWallet] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // Family Members & Invites inside Manage Modal
  const [walletInvites, setWalletInvites] = useState<InviteRecord[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteFormError, setInviteFormError] = useState<string | null>(null);
  const [latestInvite, setLatestInvite] = useState<InviteRecord | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(
    null
  );
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [walletsRes, invitesRes] = await Promise.all([
        fetch("/api/wallets?includeArchived=true", { cache: "no-store" }),
        fetch("/api/invites", { cache: "no-store" }),
      ]);

      const walletsData = await walletsRes.json().catch(() => ({}));
      const invitesData = await invitesRes.json().catch(() => ({}));

      if (!walletsRes.ok) {
        throw new Error(walletsData.error ?? "Gagal memuat daftar dompet.");
      }
      if (!invitesRes.ok) {
        throw new Error(invitesData.error ?? "Gagal memuat undangan masuk.");
      }

      setWallets(
        Array.isArray(walletsData.wallets)
          ? (walletsData.wallets as WalletWithRole[])
          : []
      );
      setPendingInvites(
        Array.isArray(invitesData.invites)
          ? (invitesData.invites as PendingInviteView[])
          : []
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat data dompet.";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialData && refreshTrigger === 0) {
      return;
    }
    void loadData();
  }, [loadData, refreshTrigger, hasInitialData]);

  const activeWallets = useMemo(
    () =>
      wallets.filter(
        (w) =>
          w.archivedAt === null && (w.role === "owner" || w.role === "editor")
      ),
    [wallets]
  );

  const watchedWallets = useMemo(
    () => wallets.filter((w) => w.archivedAt === null && w.role === "viewer"),
    [wallets]
  );

  const archivedOwnedWallets = useMemo(
    () => wallets.filter((w) => w.archivedAt !== null && w.role === "owner"),
    [wallets]
  );

  const managedWallet = useMemo(
    () =>
      manageWalletId
        ? (wallets.find((w) => w.id === manageWalletId) ?? null)
        : null,
    [wallets, manageWalletId]
  );

  const loadWalletInvites = useCallback(async (walletId: string) => {
    setLoadingInvites(true);
    try {
      const res = await fetch(
        `/api/wallets/${encodeURIComponent(walletId)}/invites`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal memuat daftar undangan dompet.");
      }
      setWalletInvites(
        Array.isArray(data.invites) ? (data.invites as InviteRecord[]) : []
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal memuat daftar undangan dompet."
      );
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  function openManageModal(wallet: WalletWithRole) {
    if (wallet.role !== "owner") {
      return;
    }
    setManageWalletId(wallet.id);
    setEditName(wallet.name);
    setEditType(wallet.type);
    setConfirmArchive(false);
    setManageError(null);
    setInviteEmail("");
    setInviteRole("editor");
    setInviteFormError(null);
    setLatestInvite(null);
    setCopiedToken(null);
    setConfirmRemoveUserId(null);
    void loadWalletInvites(wallet.id);
  }

  function openCreateModal() {
    setNewName("");
    setNewType("bank");
    setNewBalanceDigits("0");
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleAcceptInvite(token: string, inviteId: string) {
    setBusyInviteId(inviteId);
    try {
      const res = await fetch(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal menerima undangan dompet.");
        return;
      }

      toast.success(
        `Berhasil bergabung ke dompet "${data.walletName ?? "Dompet Bersama"}".`
      );
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat menerima undangan.");
    } finally {
      setBusyInviteId(null);
    }
  }

  async function handleCreateWallet(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(null);

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError("Nama dompet wajib diisi.");
      return;
    }

    const parsedBalance = newBalanceDigits === "" ? 0 : Number(newBalanceDigits);
    if (!Number.isSafeInteger(parsedBalance) || parsedBalance < 0) {
      setCreateError("Saldo awal harus berupa bilangan bulat minimal Rp 0.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          type: newType,
          initialBalance: parsedBalance,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal membuat dompet baru.";
        setCreateError(msg);
        toast.error(msg);
        return;
      }

      toast.success(`Dompet "${trimmedName}" berhasil dibuat.`);
      setCreateOpen(false);
      triggerRefresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat membuat dompet.";
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateWallet(event: React.FormEvent) {
    event.preventDefault();
    if (!managedWallet || managedWallet.role !== "owner") {
      return;
    }

    setManageError(null);
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setManageError("Nama dompet tidak boleh kosong.");
      return;
    }

    setSavingWallet(true);
    try {
      const res = await fetch(
        `/api/wallets/${encodeURIComponent(managedWallet.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            type: editType,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal memperbarui dompet.";
        setManageError(msg);
        toast.error(msg);
        return;
      }

      toast.success("Pengaturan dompet berhasil diperbarui.");
      triggerRefresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat memperbarui dompet.";
      setManageError(msg);
      toast.error(msg);
    } finally {
      setSavingWallet(false);
    }
  }

  async function handleArchiveWallet() {
    if (!managedWallet || managedWallet.role !== "owner") {
      return;
    }

    setArchivingWallet(true);
    setManageError(null);
    try {
      const res = await fetch(
        `/api/wallets/${encodeURIComponent(managedWallet.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal mengarsipkan dompet.";
        setManageError(msg);
        toast.error(msg);
        return;
      }

      toast.success(`Dompet "${managedWallet.name}" berhasil diarsipkan.`);
      setManageWalletId(null);
      triggerRefresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat mengarsipkan dompet.";
      setManageError(msg);
      toast.error(msg);
    } finally {
      setArchivingWallet(false);
    }
  }

  async function handleUnarchiveWallet(wallet: WalletWithRole) {
    setUnarchivingId(wallet.id);
    try {
      const res = await fetch(`/api/wallets/${encodeURIComponent(wallet.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mengaktifkan kembali dompet.");
        return;
      }

      toast.success(`Dompet "${wallet.name}" diaktifkan kembali.`);
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat mengaktifkan dompet.");
    } finally {
      setUnarchivingId(null);
    }
  }

  async function handleCreateInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!managedWallet || managedWallet.role !== "owner") {
      return;
    }

    setInviteFormError(null);
    const trimmedEmail = inviteEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setInviteFormError("Format email tidak valid.");
      return;
    }

    setSendingInvite(true);
    try {
      const res = await fetch(
        `/api/wallets/${encodeURIComponent(managedWallet.id)}/invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail ? trimmedEmail : null,
            role: inviteRole,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal membuat tautan undangan.";
        setInviteFormError(msg);
        toast.error(msg);
        return;
      }

      const created = data.invite as InviteRecord | undefined;
      if (created) {
        setLatestInvite(created);
      }
      setInviteEmail("");
      toast.success("Tautan undangan berhasil dibuat.");
      await loadWalletInvites(managedWallet.id);
    } catch {
      const msg = "Terjadi gangguan jaringan saat membuat undangan.";
      setInviteFormError(msg);
      toast.error(msg);
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!managedWallet || managedWallet.role !== "owner") {
      return;
    }

    setRemovingUserId(userId);
    try {
      const res = await fetch(
        `/api/wallets/${encodeURIComponent(managedWallet.id)}/members/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mengeluarkan anggota dompet.");
        return;
      }

      toast.success("Anggota berhasil dikeluarkan dari dompet.");
      setConfirmRemoveUserId(null);
      triggerRefresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat mengeluarkan anggota.");
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleCopyInviteLink(token: string) {
    const base =
      origin || (typeof window !== "undefined" ? window.location.origin : "");
    const link = `${base}/undangan/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      toast.success("Tautan undangan disalin.");
      setTimeout(() => {
        setCopiedToken((curr) => (curr === token ? null : curr));
      }, 2500);
    } catch {
      toast.error("Gagal menyalin otomatis. Silakan salin tautan secara manual.");
    }
  }

  const totalActiveBalance = activeWallets.reduce(
    (sum, w) => sum + w.balance,
    0
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Card padding="lg">
        <EmptyState
          title="Gagal memuat dompet"
          description={loadError}
          action={
            <Button variant="primary" onClick={() => void loadData()}>
              Coba Lagi
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#1C1917]">
            Dompet & Keluarga
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#78716C]">
            Kelola dompet tunai, rekening bank, e-wallet, tabungan, serta
            akses bersama anggota keluarga.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          <span>Tambah Dompet</span>
        </Button>
      </div>

      {/* Kotak Undangan Masuk */}
      {pendingInvites.length > 0 && (
        <Card
          padding="md"
          className="border-[#BBF7D0] bg-[#DCFCE7]/35 space-y-3"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#14532D] text-[#FFFFFF]">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-medium text-[#14532D]">
                Kotak Undangan Masuk (
                <span className="tnum">{pendingInvites.length}</span>)
              </h2>
              <p className="text-xs text-[#166534]">
                Anda diundang untuk bergabung ke dompet bersama berikut.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-[#BBF7D0] bg-[#FFFFFF] p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#1C1917]">
                      {invite.walletName}
                    </p>
                    <Badge
                      variant={
                        invite.role === "editor" ? "forest" : "neutral"
                      }
                    >
                      {invite.role === "editor" ? "Editor" : "Pemantau"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#57534E]">
                    Pengundang:{" "}
                    <strong className="font-medium text-[#1C1917]">
                      {invite.inviterName}
                    </strong>
                  </p>
                  <p className="text-xs text-[#78716C]">
                    Berlaku hingga{" "}
                    <span className="tnum">
                      {formatDateID(invite.expiresAt)}
                    </span>
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="primary"
                  loading={busyInviteId === invite.id}
                  onClick={() =>
                    void handleAcceptInvite(invite.token, invite.id)
                  }
                  className="shrink-0"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Terima Undangan</span>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Daftar Dompet Aktif */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-medium text-[#1C1917]">
              Daftar Dompet Aktif
            </h2>
            <p className="text-xs text-[#78716C]">
              Total gabungan{" "}
              <span className="tnum font-semibold text-[#1C1917]">
                {activeWallets.length}
              </span>{" "}
              dompet:{" "}
              <span className="tnum font-semibold text-[#14532D]">
                {formatIDR(totalActiveBalance)}
              </span>
            </p>
          </div>
        </div>

        {activeWallets.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon={<WalletIcon className="h-5 w-5" />}
              title="Belum ada dompet aktif"
              description="Tambahkan dompet pertama Anda untuk mulai mencatat pemasukan dan pengeluaran."
              action={
                <Button variant="primary" onClick={openCreateModal}>
                  <Plus className="h-4 w-4" />
                  <span>Tambah Dompet</span>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeWallets.map((wallet) => {
              const typeMeta = getWalletTypeMeta(wallet.type);
              const TypeIcon = typeMeta.icon;
              const roleMeta = getRoleMeta(wallet.role);
              const isOwner = wallet.role === "owner";

              return (
                <Card
                  key={wallet.id}
                  padding="md"
                  className="flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#14532D]">
                          <TypeIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-[#1C1917]">
                            {wallet.name}
                          </h3>
                          <p className="text-xs text-[#78716C]">
                            {typeMeta.label}
                            {!isOwner ? ` · Milik ${wallet.ownerName}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {wallet.isShared && (
                          <Badge variant="forest">
                            <Users className="h-3 w-3" />
                            <span>Dompet Bersama</span>
                          </Badge>
                        )}
                        <Badge variant={roleMeta.variant}>
                          {roleMeta.label}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[#78716C]">
                        Saldo Saat Ini
                      </p>
                      <p className="tnum font-display mt-0.5 text-2xl sm:text-3xl font-medium text-[#1C1917]">
                        {formatIDR(wallet.balance)}
                      </p>
                    </div>

                    {/* Member Avatars / Initials */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center -space-x-1.5">
                        {wallet.members.slice(0, 4).map((member) => {
                          const memberRoleLabel = getRoleMeta(member.role).label;
                          return (
                            <span
                              key={member.userId}
                              title={`${member.name} (${memberRoleLabel})`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#FFFFFF] bg-[#EFECE4] text-[10px] font-semibold text-[#14532D]"
                            >
                              {getInitials(member.name)}
                            </span>
                          );
                        })}
                        {wallet.members.length > 4 && (
                          <span className="tnum inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#FFFFFF] bg-[#EFECE4] text-[10px] font-semibold text-[#57534E]">
                            +{wallet.members.length - 4}
                          </span>
                        )}
                      </div>
                      <span className="tnum text-xs text-[#78716C]">
                        {wallet.members.length} anggota
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[#E7E2D8] pt-3">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openQuickAdd("expense", wallet.id)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Catat</span>
                    </Button>

                    {isOwner && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openManageModal(wallet)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        <span>Kelola & Undang</span>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Dompet Dipantau (Viewer) */}
      {watchedWallets.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-medium text-[#1C1917]">
                Dompet Dipantau
              </h2>
              <p className="text-xs text-[#78716C]">
                Akses Pemantau (hanya-baca) · tidak dihitung ke total saldo atau
                arus kas pribadi Anda.
              </p>
            </div>
            <Badge variant="neutral">
              <Eye className="h-3 w-3" />
              <span>Hanya Pantau · Tidak masuk saldo pribadi</span>
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {watchedWallets.map((wallet) => {
              const typeMeta = getWalletTypeMeta(wallet.type);
              const TypeIcon = typeMeta.icon;

              return (
                <Card
                  key={wallet.id}
                  padding="md"
                  subtle
                  className="flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E]">
                          <TypeIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-[#1C1917]">
                            {wallet.name}
                          </h3>
                          <p className="text-xs text-[#78716C]">
                            {typeMeta.label} · Pemilik: {wallet.ownerName}
                          </p>
                        </div>
                      </div>

                      <Badge variant="neutral">Pemantau</Badge>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[#78716C]">
                        Saldo Dompet
                      </p>
                      <p className="tnum font-display mt-0.5 text-2xl font-medium text-[#57534E]">
                        {formatIDR(wallet.balance)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#E7E2D8] pt-3 text-xs">
                    <span className="text-[#78716C]">Mode baca saja</span>
                    <Link
                      href="/transaksi"
                      className="font-semibold text-[#14532D] hover:underline"
                    >
                      Lihat Transaksi →
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Archived Wallets (Owner recovery strip) */}
      {archivedOwnedWallets.length > 0 && (
        <Card padding="md" subtle>
          <CardHeader
            serif
            title="Dompet Diarsipkan"
            subtitle="Riwayat transaksi tetap tersimpan; Anda dapat mengaktifkannya kembali kapan saja"
          />
          <div className="space-y-2">
            {archivedOwnedWallets.map((wallet) => {
              const typeMeta = getWalletTypeMeta(wallet.type);
              return (
                <div
                  key={wallet.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#1C1917]">
                      {wallet.name}{" "}
                      <span className="text-xs font-normal text-[#78716C]">
                        · {typeMeta.label}
                      </span>
                    </p>
                    <p className="tnum text-xs text-[#78716C]">
                      Saldo terakhir: {formatIDR(wallet.balance)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={unarchivingId === wallet.id}
                    onClick={() => void handleUnarchiveWallet(wallet)}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    <span>Aktifkan Kembali</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Create Wallet Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah Dompet Baru"
        description="Pisahkan kas harian, rekening bank, e-wallet, atau pos tabungan Anda."
        size="sm"
      >
        <form onSubmit={handleCreateWallet} noValidate className="space-y-4">
          {createError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
            >
              {createError}
            </div>
          )}

          <Input
            label="Nama Dompet"
            required
            maxLength={80}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Contoh: BCA Utama, Kas Belanja, Tabungan Liburan"
          />

          <Select
            label="Jenis Dompet"
            required
            value={newType}
            onChange={(e) => setNewType(e.target.value as WalletType)}
          >
            <option value="cash">Tunai</option>
            <option value="bank">Bank</option>
            <option value="ewallet">E-Wallet</option>
            <option value="savings">Tabungan</option>
          </Select>

          <div className="space-y-1.5">
            <label
              htmlFor="new-wallet-balance"
              className="block text-xs font-medium text-[#57534E]"
            >
              Saldo Awal
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-3.5 font-display text-lg text-[#78716C]">
                Rp
              </span>
              <input
                id="new-wallet-balance"
                type="text"
                inputMode="numeric"
                value={formatDigitsAllowZero(newBalanceDigits)}
                onChange={(e) => {
                  const clean = sanitizeDigitsAllowZero(e.target.value);
                  if (clean.length <= 15) {
                    setNewBalanceDigits(clean);
                  }
                }}
                placeholder="0"
                className="tnum font-display w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] py-2.5 pl-11 pr-4 text-2xl font-medium text-[#1C1917] focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15"
              />
            </div>
            <p className="text-xs text-[#78716C]">
              Saldo awal dicatat sebagai modal awal dompet (minimal Rp 0).
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E2D8]">
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" loading={creating}>
              Simpan Dompet
            </Button>
          </div>
        </form>
      </Modal>

      {/* Owner-only Manage Wallet & Family Modal */}
      <Modal
        open={Boolean(managedWallet)}
        onClose={() => setManageWalletId(null)}
        title={
          managedWallet
            ? `Kelola ${managedWallet.name}`
            : "Kelola Dompet & Keluarga"
        }
        description="Ubah detail dompet, arsipkan, atau undang anggota keluarga."
        size="lg"
      >
        {managedWallet && managedWallet.role === "owner" && (
          <div className="space-y-6">
            {/* Section 1: Pengaturan Dompet */}
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
                Pengaturan Dompet
              </h3>

              {manageError && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
                >
                  {manageError}
                </div>
              )}

              <form
                onSubmit={handleUpdateWallet}
                noValidate
                className="space-y-3"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Nama Dompet"
                    required
                    maxLength={80}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Select
                    label="Jenis Dompet"
                    required
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as WalletType)}
                  >
                    <option value="cash">Tunai</option>
                    <option value="bank">Bank</option>
                    <option value="ewallet">E-Wallet</option>
                    <option value="savings">Tabungan</option>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmArchive((prev) => !prev)}
                    disabled={savingWallet || archivingWallet}
                    className="text-[#B91C1C] hover:bg-[#FEE2E2]/45 hover:text-[#B91C1C]"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>Arsipkan Dompet</span>
                  </Button>

                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={savingWallet}
                    disabled={archivingWallet}
                  >
                    Simpan Perubahan
                  </Button>
                </div>
              </form>

              {confirmArchive && (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/45 p-3.5 space-y-2.5">
                  <p className="text-xs text-[#57534E] leading-relaxed">
                    Dompet{" "}
                    <strong className="text-[#1C1917]">
                      {managedWallet.name}
                    </strong>{" "}
                    akan disembunyikan dari ringkasan aktif, namun seluruh
                    riwayat transaksi tetap aman.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmArchive(false)}
                      disabled={archivingWallet}
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={archivingWallet}
                      onClick={() => void handleArchiveWallet()}
                    >
                      Ya, Arsipkan
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <div className="border-t border-[#E7E2D8]" />

            {/* Section 2: Anggota & Undangan */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#78716C]">
                  Anggota & Undangan
                </h3>
                <span className="tnum text-xs text-[#78716C]">
                  {managedWallet.members.length} anggota terdaftar
                </span>
              </div>

              {/* Current Members */}
              <div className="space-y-2">
                {managedWallet.members.map((member) => {
                  const roleMeta = getRoleMeta(member.role);
                  const isSelf = member.userId === currentUserId;
                  const isConfirming = confirmRemoveUserId === member.userId;

                  return (
                    <div
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/60 px-3.5 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFECE4] text-xs font-semibold text-[#14532D]">
                          {getInitials(member.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-[#1C1917]">
                              {member.name}
                              {isSelf ? " (Anda)" : ""}
                            </p>
                            <Badge variant={roleMeta.variant}>
                              {roleMeta.label}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-[#78716C]">
                            {member.email}
                          </p>
                        </div>
                      </div>

                      {!isSelf && member.role !== "owner" && (
                        <div>
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="danger"
                                loading={removingUserId === member.userId}
                                onClick={() =>
                                  void handleRemoveMember(member.userId)
                                }
                              >
                                Ya, Keluarkan
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={removingUserId === member.userId}
                                onClick={() => setConfirmRemoveUserId(null)}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirmRemoveUserId(member.userId)
                              }
                              className="text-[#B91C1C] hover:bg-[#FEE2E2]/50 hover:text-[#B91C1C]"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                              <span>Keluarkan</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Form Undang Anggota Keluarga */}
              <form
                onSubmit={handleCreateInvite}
                noValidate
                className="rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-[#14532D]" />
                  <h4 className="text-sm font-semibold text-[#1C1917]">
                    Undang Anggota Keluarga
                  </h4>
                </div>

                {inviteFormError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3 py-2 text-xs text-[#B91C1C]"
                  >
                    {inviteFormError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <Input
                    label="Email Anggota (Opsional)"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="pasangan@email.com (kosongkan untuk tautan umum)"
                    wrapperClassName="sm:col-span-7"
                  />

                  <Select
                    label="Peran"
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as "editor" | "viewer")
                    }
                    wrapperClassName="sm:col-span-5"
                  >
                    <option value="editor">Editor (Catat transaksi)</option>
                    <option value="viewer">Pemantau (Baca saja)</option>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#78716C]">
                    Tautan berlaku 7 hari untuk 1 kali penerimaan.
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    loading={sendingInvite}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Buat Tautan Undangan</span>
                  </Button>
                </div>
              </form>

              {/* Newly Created Copyable Invite Link */}
              {latestInvite && (
                <div className="rounded-xl border border-[#BBF7D0] bg-[#DCFCE7]/45 p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-[#14532D]">
                    Tautan Undangan Siap Dibagikan
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      readOnly
                      aria-label="Tautan undangan dompet"
                      value={`${origin}/undangan/${latestInvite.token}`}
                      onClick={(e) => e.currentTarget.select()}
                      className="w-full rounded-lg border border-[#BBF7D0] bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#1C1917] focus:outline-none"
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        void handleCopyInviteLink(latestInvite.token)
                      }
                      className="shrink-0"
                    >
                      {copiedToken === latestInvite.token ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Salin Tautan</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Recent Invites List */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#57534E]">
                  Riwayat Tautan Undangan
                </p>

                {loadingInvites ? (
                  <p className="text-xs text-[#78716C]">
                    Memuat daftar undangan...
                  </p>
                ) : walletInvites.length === 0 ? (
                  <p className="text-xs text-[#78716C]">
                    Belum ada undangan yang dibuat untuk dompet ini.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {walletInvites.slice(0, 6).map((inv) => {
                      const isAccepted = inv.acceptedAt !== null;
                      const isExpired =
                        !isAccepted && Date.parse(inv.expiresAt) <= Date.now();
                      const isPending = !isAccepted && !isExpired;

                      return (
                        <div
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0]/50 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-[#1C1917]">
                                {inv.email ?? "Tautan Umum"}
                              </span>
                              <Badge
                                variant={
                                  inv.role === "editor" ? "forest" : "neutral"
                                }
                              >
                                {inv.role === "editor" ? "Editor" : "Pemantau"}
                              </Badge>
                              {isAccepted ? (
                                <Badge variant="inflow">Diterima</Badge>
                              ) : isExpired ? (
                                <Badge variant="outflow">Kedaluwarsa</Badge>
                              ) : (
                                <Badge variant="warning">Menunggu</Badge>
                              )}
                            </div>
                            <p className="tnum text-[11px] text-[#78716C]">
                              Berlaku s.d. {formatDateID(inv.expiresAt)}
                            </p>
                          </div>

                          {isPending && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                void handleCopyInviteLink(inv.token)
                              }
                            >
                              {copiedToken === inv.token ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  <span>Disalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Salin Tautan</span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
