"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/primitives";

export interface LandingDemoCtaProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  nextPath?: string;
  className?: string;
  showIcon?: boolean;
}

/**
 * 1-click button that logs into the seeded 6-month Indonesian demo workspace
 * (`demo@aruskas.id`) and navigates straight to the app.
 */
export function LandingDemoCta({
  variant = "secondary",
  size = "lg",
  label = "Coba Akun Demo (1-Klik)",
  nextPath = "/dashboard",
  className,
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

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={loading}
      onClick={handleDemoLogin}
      className={className}
    >
      {showIcon && !loading && (
        <Sparkles className="h-4 w-4 text-[#14532D] shrink-0" />
      )}
      <span>{loading ? "Menyiapkan Demo..." : label}</span>
    </Button>
  );
}
