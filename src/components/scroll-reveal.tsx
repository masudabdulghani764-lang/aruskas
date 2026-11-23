"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  /** Direction offset distance in px (default 22px) */
  distance?: number;
}

/**
 * Lightweight, bidirectional IntersectionObserver scroll-reveal component.
 * Animates elements smoothly both when scrolling down (gliding up) and
 * when scrolling back up (gliding softly down from above), with zero
 * heavy animation runtime overhead and full `prefers-reduced-motion` support.
 */
export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
  distance = 22,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);
  const [exitDirection, setExitDirection] = useState<"above" | "below">("below");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }

    // Check initial viewport position right away so above-the-fold stays visible
    const rect = el.getBoundingClientRect();
    const inViewNow = rect.top < window.innerHeight * 0.96 && rect.bottom > 0;
    if (!inViewNow) {
      setExitDirection(rect.top >= window.innerHeight ? "below" : "above");
      setVisible(false);
    }
    setReady(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
          } else {
            // Determine whether element exited above or below viewport
            const top = entry.boundingClientRect.top;
            setExitDirection(top < 0 ? "above" : "below");
            setVisible(false);
          }
        }
      },
      {
        threshold: 0.08,
        rootMargin: "-24px 0px -32px 0px",
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hiddenTransform =
    exitDirection === "above"
      ? `translate3d(0, -${Math.round(distance * 0.75)}px, 0) scale(0.99)`
      : `translate3d(0, ${distance}px, 0) scale(0.99)`;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate3d(0, 0, 0) scale(1)" : hiddenTransform,
        transition: ready
          ? `opacity 520ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms, transform 580ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`
          : "none",
        willChange: ready ? "opacity, transform" : undefined,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Sticky top scroll-progress hairline + floating "Ke Atas" button.
 */
export function ScrollProgressAndTopButton() {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    let rafId = 0;

    function update() {
      rafId = 0;
      const scrollY = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollY / docHeight) * 100)) : 0;
      setProgress(pct);
      setShowTop(scrollY > 360);
    }

    function onScroll() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      {/* Razor-thin scroll progress hairline fixed at top of viewport */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2.5px] bg-transparent"
      >
        <div
          className="h-full bg-gradient-to-r from-[#14532D] via-[#15803D] to-[#D9A75A] transition-[width] duration-100 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Floating Warm Ivory "Ke Atas" pill */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Kembali ke atas"
        className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-1.5 rounded-full border border-[#D9D1C3] bg-[#FFFFFF]/95 px-3.5 py-2 text-xs font-semibold text-[#14532D] shadow-[0_8px_24px_rgba(20,83,45,0.12)] backdrop-blur-sm transition-all duration-300 ease-out hover:bg-[#14532D] hover:text-[#FFFFFF] hover:border-[#14532D] cursor-pointer ${
          showTop
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <ArrowUp className="h-3.5 w-3.5" />
        <span>Ke Atas</span>
      </button>
    </>
  );
}
