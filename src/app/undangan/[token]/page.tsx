"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, SkeletonCard } from "@/components/ui/primitives";
import type { SafeUser } from "@/lib/auth";
import { formatDateID } from "@/lib/format";

interface InvitePreview {
  id: string;
  walletId: string;
  walletName: string;
  inviterName: string;
  role: "editor" | "viewer";
  emailMasked: string | null;
  requiresSpecificEmail: boolean;
  expiresAt: string;
  createdAt: string;
}

export default function UndanganTokenPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params?.token === "string" ? params.token : "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteStatus, setInviteStatus] = useState<number>(200);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteStatus(404);
      setInviteError("Tautan undangan tidak ditemukan.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/invites/${encodeURIComponent(token)}`, { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ])
      .then(async ([inviteRes, meRes]) => {
        if (cancelled) {
          return;
        }

        if (meRes.ok) {
          const meData = await meRes.json().catch(() => ({}));
          setUser((meData.user as SafeUser) ?? null);
        } else {
          setUser(null);
        }

        const inviteData = await inviteRes.json().catch(() => ({}));
        setInviteStatus(inviteRes.status);
        if (!inviteRes.ok) {
          setInvite(null);
          setInviteError(
            inviteData.error ?? "Tautan undangan tidak ditemukan."
          );
        } else {
          setInvite((inviteData.invite as InvitePreview) ?? null);
          setInviteError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInviteStatus(500);
          setInviteError("Gagal memuat detail undangan.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAcceptInvite() {
    if (!token) {
      return;
    }
    setAccepting(true);
    setAcceptError(null);

    try {
      const res = await fetch(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error ?? "Gagal menerima undangan dompet.";
        setAcceptError(msg);
        toast.error(msg);
        if (res.status === 410) {
          setInviteStatus(410);
          setInviteError(msg);
          setInvite(null);
        }
        return;
      }

      toast.success(`Berhasil bergabung ke dompet "${data.walletName}".`);
      router.push("/dompet");
      router.refresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat menerima undangan.";
      setAcceptError(msg);
      toast.error(msg);
    } finally {
      setAccepting(false);
    }
  }

  async function handleSwitchAccount() {
    setSwitchingAccount(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Gagal mengganti akun.");
        return;
      }
      router.push(`/masuk?next=${encodeURIComponent(`/undangan/${token}`)}`);
      router.refresh();
    } catch {
      toast.error("Gagal mengganti akun.");
    } finally {
      setSwitchingAccount(false);
    }
  }

  const nextParam = encodeURIComponent(`/undangan/${token}`);
  const roleLabel = invite?.role === "editor" ? "Editor" : "Pemantau";
  const roleDescription =
    invite?.role === "editor"
      ? "Dapat melihat saldo serta mencatat, mengubah, dan menghapus transaksi miliknya sendiri di dompet ini."
      : "Hanya dapat melihat saldo, riwayat transaksi, lampiran nota, dan laporan dompet ini.";

  return (
    <div className="min-h-screen bg-[#F7F5F0] px-4 py-10 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57534E] transition-colors hover:text-[#1C1917]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Beranda</span>
          </Link>
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-[#14532D]"
          >
            ArusKas.
          </Link>
        </div>

        {loading ? (
          <SkeletonCard lines={4} />
        ) : invite ? (
          <Card padding="lg">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#BBF7D0] bg-[#DCFCE7] text-[#14532D]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#14532D]">
                  Undangan Dompet Bersama
                </p>
                <h1 className="font-display mt-1 text-2xl font-medium text-[#1C1917]">
                  {invite.walletName}
                </h1>
                <p className="mt-1 text-sm text-[#57534E]">
                  Diundang oleh{" "}
                  <strong className="font-semibold text-[#1C1917]">
                    {invite.inviterName}
                  </strong>
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#78716C]">
                  Peran yang Diberikan
                </span>
                <Badge variant={invite.role === "editor" ? "forest" : "neutral"}>
                  {roleLabel}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-[#57534E]">
                {roleDescription}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E7E2D8] pt-2.5 text-xs text-[#78716C]">
                <span>Berlaku hingga</span>
                <span className="tnum font-medium text-[#1C1917]">
                  {formatDateID(invite.expiresAt)}
                </span>
              </div>
              {invite.requiresSpecificEmail && invite.emailMasked && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E7E2D8] pt-2.5 text-xs text-[#78716C]">
                  <span>Ditujukan untuk email</span>
                  <span className="font-medium text-[#1C1917]">
                    {invite.emailMasked}
                  </span>
                </div>
              )}
            </div>

            {acceptError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 px-3.5 py-2.5 text-xs sm:text-sm text-[#B91C1C]"
              >
                {acceptError}
              </div>
            )}

            {user ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="text-[#78716C]">Masuk sebagai</p>
                    <p className="truncate font-semibold text-[#1C1917]">
                      {user.name} ({user.email})
                    </p>
                  </div>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#14532D]" />
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  loading={accepting}
                  onClick={handleAcceptInvite}
                  className="w-full"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Terima Undangan</span>
                </Button>

                <button
                  type="button"
                  disabled={switchingAccount}
                  onClick={handleSwitchAccount}
                  className="w-full text-center text-xs font-medium text-[#57534E] hover:text-[#1C1917] hover:underline underline-offset-4 py-1 cursor-pointer"
                >
                  {switchingAccount
                    ? "Mengalihkan akun..."
                    : "Keluar & masuk dengan akun lain"}
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="text-xs sm:text-sm text-[#57534E] leading-relaxed">
                  Silakan masuk atau buat akun terlebih dahulu untuk menerima
                  undangan dompet bersama ini.
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Link
                    href={`/masuk?next=${nextParam}`}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                  >
                    Masuk
                  </Link>
                  <Link
                    href={`/daftar?next=${nextParam}`}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4]"
                  >
                    Daftar Akun Baru
                  </Link>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card padding="lg" className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#E7E2D8] bg-[#EFECE4] text-[#57534E]">
              {inviteStatus === 410 ? (
                <Clock className="h-5 w-5 text-[#D97706]" />
              ) : (
                <AlertCircle className="h-5 w-5 text-[#B91C1C]" />
              )}
            </div>

            <h1 className="font-display text-2xl font-medium text-[#1C1917]">
              {inviteStatus === 410
                ? "Undangan Tidak Berlaku"
                : "Undangan Tidak Ditemukan"}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#57534E] leading-relaxed">
              {inviteError ??
                "Tautan undangan ini sudah kedaluwarsa, pernah digunakan, atau tidak tersedia."}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex h-10 items-center rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-4 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE4]"
              >
                Ke Halaman Utama
              </Link>
              {user ? (
                <Link
                  href="/dompet"
                  className="inline-flex h-10 items-center rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  Buka Dompet
                </Link>
              ) : (
                <Link
                  href="/masuk"
                  className="inline-flex h-10 items-center rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#166534]"
                >
                  Masuk
                </Link>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
