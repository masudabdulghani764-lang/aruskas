import React from "react";
import { cn } from "@/components/ui/primitives";

/**
 * Official ArusKas "W1 Clean" emblem — twin ascending rounded cashflow waves
 * in Warm Ivory (#FAF6EE) and Champagne Gold (#E8BC68) over Deep Forest Emerald.
 */
export function ArusKasLogoMark({
  className,
  rounded = "rounded-2xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden shadow-xs",
        rounded,
        className
      )}
      style={{
        backgroundImage:
          "radial-gradient(circle at 24% 22%, rgba(34, 122, 72, 0.45) 0%, rgba(34, 122, 72, 0) 65%), linear-gradient(135deg, #165B33 0%, #0B2919 100%)",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <path
          d="M232 540 C350 314 570 540 742 332"
          stroke="#FAF6EE"
          strokeWidth="74"
          strokeLinecap="round"
        />
        <path
          d="M282 692 C400 466 620 692 792 484"
          stroke="#E8BC68"
          strokeWidth="74"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
