"use client";

import React, { useEffect, useState } from "react";

type SplashPhase = "hidden" | "loading" | "absorb" | "exit";

const SPLASH_SESSION_KEY = "aruskas_splash_seen_v2";

/**
 * Pure logo-only launch splash for installed iPhone / PWA standalone apps:
 * - Skipped on regular desktop/mobile web browsers (instant page load)
 * - Skipped inside Android APK (uses native hardware-accelerated splash)
 * 1. Continuous liquid wave flow (no text, no box)
 * 2. Full emerald backdrop absorbs radially into the two wave lines
 * 3. Staggered 1-by-1 exit: upper emerald wave glides out first, lower gold wave second
 */
export function AppSplashScreen() {
  const [phase, setPhase] = useState<SplashPhase>("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Android APK runs its own synchronized hardware-accelerated native splash
    const ua = window.navigator.userAgent || "";
    if (ua.includes("ArusKasApp/")) {
      return;
    }

    // Only show launch splash when opened as an installed Home Screen app (iPhone/PWA standalone)
    let isStandaloneApp = false;
    try {
      isStandaloneApp =
        (window.navigator as Navigator & { standalone?: boolean }).standalone ===
          true ||
        (typeof window.matchMedia === "function" &&
          window.matchMedia("(display-mode: standalone)").matches);
    } catch {
      isStandaloneApp = false;
    }
    if (!isStandaloneApp) {
      return;
    }

    // Honor reduced motion preference
    try {
      if (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }
    } catch {
      // ignore
    }

    // Play once per browser / iPhone Home Screen app session
    try {
      if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "1") {
        return;
      }
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      // ignore restricted storage
    }

    setPhase("loading");

    const timers: number[] = [];
    let finished = false;

    const triggerReveal = () => {
      if (finished) return;
      finished = true;

      // Phase 2: Entire green screen absorbs radially into the two wave lines
      setPhase("absorb");

      // Phase 3: Wave 1 exits first, then Wave 2 exits second (1-by-1)
      timers.push(
        window.setTimeout(() => {
          setPhase("exit");
        }, 460)
      );

      // Phase 4: Unmount completely once Wave 2 completes
      timers.push(
        window.setTimeout(() => {
          setPhase("hidden");
        }, 1060)
      );
    };

    const startedAt = Date.now();
    const minLoadingMs = 820;

    const onReady = () => {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, minLoadingMs - elapsed);
      timers.push(window.setTimeout(triggerReveal, wait));
    };

    if (document.readyState === "complete") {
      onReady();
    } else {
      window.addEventListener("load", onReady, { once: true });
      // Hard fallback so slow third-party resources never hold the splash
      timers.push(window.setTimeout(triggerReveal, 2200));
    }

    return () => {
      window.removeEventListener("load", onReady);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`aruskas-splash aruskas-splash--${phase} no-print fixed inset-0 z-[120] pointer-events-none select-none overflow-hidden`}
    >
      {/* Full emerald screen that absorbs radially into the wave lines (no box) */}
      <div className="aruskas-splash-backdrop absolute inset-0" />

      {/* Pure twin wave lines (zero text, zero box) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="aruskas-splash-svg h-28 w-28 sm:h-32 sm:w-32 overflow-visible"
          viewBox="0 0 1024 1024"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g className="aruskas-splash-group-1">
            <path
              className="aruskas-splash-wave aruskas-splash-wave-1"
              d="M232 540 C350 314 570 540 742 332"
              strokeWidth="78"
              strokeLinecap="round"
            />
          </g>
          <g className="aruskas-splash-group-2">
            <path
              className="aruskas-splash-wave aruskas-splash-wave-2"
              d="M282 692 C400 466 620 692 792 484"
              strokeWidth="78"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
