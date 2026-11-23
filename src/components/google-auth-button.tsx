"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/components/ui/primitives";

function GoogleLogoSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.56-5.15 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3.01c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28V6.61H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.11C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

/**
 * 1-Tap Google OAuth 2.0 button supporting both /masuk and /daftar pages.
 */
export function GoogleAuthButton({
  nextPath = "/dashboard",
  label = "Lanjutkan dengan Google",
  className,
}: {
  nextPath?: string;
  label?: string;
  className?: string;
}) {
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [isIosStandalone, setIsIosStandalone] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const ua = window.navigator.userAgent || "";
      const isIos = /iPad|iPhone|iPod/.test(ua);
      const standalone =
        (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
      if (isIos && standalone) {
        setIsIosStandalone(true);
      }
    } catch {
      // ignore
    }
    fetch("/api/auth/providers", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { googleEnabled?: boolean }) => {
        if (active) {
          setGoogleEnabled(Boolean(data.googleEnabled));
        }
      })
      .catch(() => {
        if (active) {
          setGoogleEnabled(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function handleClick() {
    if (googleEnabled === false) {
      toast.info(
        "Login Google siap dipakai setelah GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET dipasang di Environment Variables Vercel."
      );
      return;
    }
    setRedirecting(true);
    window.location.href = `/api/auth/google?next=${encodeURIComponent(nextPath)}`;
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={redirecting}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[#DFD6C7] bg-[#FFFFFF] px-4 text-sm font-semibold text-[#1C1917] shadow-2xs transition-colors hover:bg-[#FAF1E0] active:bg-[#F3E5CA] disabled:opacity-60 cursor-pointer",
          className
        )}
      >
        <GoogleLogoSvg />
        <span>{redirecting ? "Menghubungkan ke Google..." : label}</span>
      </button>
      {isIosStandalone && (
        <p className="text-[11px] text-[#78716C] text-center leading-relaxed">
          Tip iPhone Layar Penuh: login dengan <strong>Email &amp; Kata Sandi</strong>{" "}
          lebih stabil agar sesi tidak berpindah ke Safari.
        </p>
      )}
    </div>
  );
}
