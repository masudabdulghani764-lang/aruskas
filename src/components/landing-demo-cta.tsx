"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export interface LandingDemoCtaProps {
  variant?: "secondary" | "primary" | "forest-outline" | "ivory";
  size?: "md" | "lg";
  label?: string;
  nextPath?: string;
  className?: string;
  showIcon?: boolean;
}

/**
 * Lightweight 1-click demo login button (zero framer-motion dependency so `/` loads fast).
 */
export function LandingDemoCta({
  variant = "secondary",
  size = "lg",
  label = "Coba Akun Demo (1-Klik)",
  nextPath = "/dashboard",
  className = "",
  showIcon = true,
}: LandingDemoCtaProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDemoLogin() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal masuk ke akun demo.");
        return;
      }

      toast.success("Masuk ke akun demo Raka & Nadia Pratama.");
      router.push(nextPath);
      router.refresh();
    } catch {
      toast.error("Terjadi gangguan jaringan saat menyiapkan akun demo.");
    } finally {
      setLoading(false);
    }
  }

  const sizeClass =
    size === "md"
      ? "h-10 px-4 text-sm rounded-xl"
      : "h-11 px-5 text-sm rounded-xl";

  const variantClass =
    variant === "primary"
      ? "bg-[#14532D] text-[#FFFFFF] hover:bg-[#166534] border border-transparent"
      : variant === "ivory"
        ? "bg-[#F7F5F0] text-[#113B26] hover:bg-[#FFFFFF] border border-transparent font-semibold"
        : variant === "forest-outline"
          ? "bg-[#1B5E3A]/60 text-[#F7F5F0] border border-[#3B825B] hover:bg-[#1E6A42]"
          : "bg-[#FFFFFF] text-[#1C1917] border border-[#D9D1C3] hover:bg-[#EFECE4] hover:border-[#C9BFA9]";

  const iconColor =
    variant === "forest-outline"
      ? "text-[#E5B869]"
      : variant === "primary"
        ? "text-[#DCFCE7]"
        : "text-[#B45309]";

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleDemoLogin}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${sizeClass} ${variantClass} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : (
        showIcon && <Sparkles className={`h-4 w-4 shrink-0 ${iconColor}`} />
      )}
      <span>{loading ? "Menyiapkan Demo..." : label}</span>
    </button>
  );
}
