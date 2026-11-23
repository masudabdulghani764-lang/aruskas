"use client";

import React, { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { clsx, type ClassValue } from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Loader2, X } from "lucide-react";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names cleanly with conflict resolution.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  pill?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[#14532D] text-[#FFFFFF] border border-[#14532D] hover:bg-[#166534] hover:border-[#166534] focus-visible:ring-[#14532D]/30",
  secondary:
    "bg-[#FFFFFF] text-[#1C1917] border border-[#E7E2D8] hover:bg-[#EFECE4] hover:border-[#D6CFC2] focus-visible:ring-[#14532D]/20 dark:bg-[#19281F] dark:text-[#F3EDE2] dark:border-[#273C2F] dark:hover:bg-[#22362A]",
  ghost:
    "bg-transparent text-[#57534E] border border-transparent hover:bg-[#EFECE4] hover:text-[#1C1917] focus-visible:ring-[#14532D]/20 dark:text-[#CEC8BE] dark:hover:bg-[#19281F] dark:hover:text-[#F3EDE2]",
  danger:
    "bg-[#B91C1C] text-[#FFFFFF] border border-[#B91C1C] hover:bg-[#991B1B] hover:border-[#991B1B] focus-visible:ring-[#B91C1C]/30",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
};

/**
 * Warm Ivory Paper button with deep forest green primary accent.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  pill = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55 cursor-pointer select-none whitespace-nowrap",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        pill && "rounded-full",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
      {children}
    </button>
  );
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  subtle?: boolean;
  interactive?: boolean;
}

const CARD_PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

/**
 * Elevated Warm Ivory Paper sheet card with hairline `#E7E2D8` border.
 */
export function Card({
  padding = "md",
  subtle = false,
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E3D4BA] dark:border-[#273C2F] shadow-xs transition-colors duration-150",
        subtle
          ? "bg-gradient-to-br from-[#FFFDF8] to-[#EFE0C6] dark:from-[#16241C] dark:to-[#101A14]"
          : "bg-gradient-to-br from-[#FFFFFF] to-[#F6E8CF] dark:from-[#15231B] dark:to-[#101A14]",
        interactive && "hover:border-[#C8B493] dark:hover:border-[#3A5A46]",
        CARD_PADDING[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  serif?: boolean;
  className?: string;
}

/**
 * Standardized card header with title, optional muted subtitle, and right action slot.
 */
export function CardHeader({
  title,
  subtitle,
  action,
  serif = false,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 mb-4", className)}
    >
      <div className="min-w-0">
        <h2
          className={cn(
            "text-[#1C1917] tracking-tight",
            serif
              ? "font-display text-xl font-medium"
              : "text-base font-semibold"
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs sm:text-sm text-[#78716C] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface FieldWrapperProps {
  id: string;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
  children: React.ReactNode;
}

function FieldWrapper({
  id,
  label,
  error,
  hint,
  required,
  wrapperClassName,
  children,
}: FieldWrapperProps) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-[#57534E]"
        >
          {label}
          {required && <span className="ml-0.5 text-[#B91C1C]">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-[#B91C1C] leading-snug">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[#78716C] leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-xl border border-[#E7E2D8] bg-[#FFFFFF] px-3.5 py-2.5 text-sm text-[#1C1917] placeholder:text-[#78716C]/70 transition-colors duration-150 focus:border-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]/15 disabled:cursor-not-allowed disabled:bg-[#EFECE4] disabled:text-[#78716C]";

const CONTROL_ERROR =
  "border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/15";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

/**
 * Accessible text/number/date input styled for Warm Ivory Paper forms.
 */
export function Input({
  label,
  error,
  hint,
  id,
  required,
  wrapperClassName,
  className,
  ...props
}: InputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      wrapperClassName={wrapperClassName}
    >
      <input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL_BASE, error && CONTROL_ERROR, className)}
        {...props}
      />
    </FieldWrapper>
  );
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

/**
 * Native select dropdown styled cleanly with custom right chevron.
 */
export function Select({
  label,
  error,
  hint,
  id,
  required,
  wrapperClassName,
  className,
  children,
  ...props
}: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      wrapperClassName={wrapperClassName}
    >
      <div className="relative">
        <select
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL_BASE,
            "appearance-none pr-9 cursor-pointer",
            error && CONTROL_ERROR,
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]"
        />
      </div>
    </FieldWrapper>
  );
}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

/**
 * Multi-line textarea styled consistently with Input and Select.
 */
export function Textarea({
  label,
  error,
  hint,
  id,
  required,
  wrapperClassName,
  className,
  rows = 3,
  ...props
}: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      wrapperClassName={wrapperClassName}
    >
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          CONTROL_BASE,
          "resize-y min-h-[76px]",
          error && CONTROL_ERROR,
          className
        )}
        {...props}
      />
    </FieldWrapper>
  );
}

export type BadgeVariant =
  | "forest"
  | "inflow"
  | "outflow"
  | "warning"
  | "neutral";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  forest: "bg-[#DCFCE7] text-[#14532D] border-[#BBF7D0]",
  inflow: "bg-[#DCFCE7]/85 text-[#15803D] border-[#BBF7D0]",
  outflow: "bg-[#FEE2E2]/80 text-[#B91C1C] border-[#FECACA]",
  warning: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]",
  neutral: "bg-[#EFECE4] text-[#57534E] border-[#E7E2D8]",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/**
 * Compact status pill badge for roles, flow directions, and budget statuses.
 */
export function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

const MODAL_SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-2xl",
} as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: keyof typeof MODAL_SIZES;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function useOverlayBehavior(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return mounted;
}

/**
 * Accessible Warm Ivory Paper modal dialog with Escape & backdrop close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  closeOnBackdrop = true,
  children,
  footer,
}: ModalProps) {
  const mounted = useOverlayBehavior(open, onClose);
  const reducedMotion = useReducedMotion();
  const titleId = useId();

  if (!mounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            className="fixed inset-0 bg-[#1C1917]/35 backdrop-blur-[1px]"
          />

          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
            className={cn(
              "relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:rounded-2xl border border-[#E7E2D8] bg-[#FFFFFF] shadow-[0_14px_40px_rgba(28,25,23,0.12)]",
              MODAL_SIZES[size]
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E7E2D8] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="font-display text-xl font-medium text-[#1C1917] leading-snug"
                >
                  {title}
                </h2>
                {description && (
                  <p className="mt-0.5 text-xs sm:text-sm text-[#78716C]">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#EFECE4] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
              {children}
            </div>

            {footer && (
              <div className="border-t border-[#E7E2D8] bg-[#F7F5F0]/60 px-5 py-3.5 sm:px-6 rounded-b-2xl">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  closeOnBackdrop?: boolean;
  widthClassName?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Right slide-over sheet drawer used for receipt-style transaction detail.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  closeOnBackdrop = true,
  widthClassName = "max-w-[460px]",
  children,
  footer,
}: DrawerProps) {
  const mounted = useOverlayBehavior(open, onClose);
  const reducedMotion = useReducedMotion();
  const titleId = useId();

  if (!mounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            className="fixed inset-0 bg-[#1C1917]/35 backdrop-blur-[1px]"
          />

          <motion.aside
            initial={reducedMotion ? { x: 0, opacity: 0 } : { x: "100%" }}
            animate={{ x: 0, opacity: 1 }}
            exit={reducedMotion ? { x: 0, opacity: 0 } : { x: "100%" }}
            transition={{
              duration: reducedMotion ? 0 : 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "relative z-10 flex h-full w-full flex-col border-l border-[#E7E2D8] bg-[#FFFFFF] shadow-[-8px_0_32px_rgba(28,25,23,0.10)]",
              widthClassName
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E7E2D8] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                {title && (
                  <h2
                    id={titleId}
                    className="font-display text-xl font-medium text-[#1C1917] leading-snug"
                  >
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="mt-0.5 text-xs sm:text-sm text-[#78716C]">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup panel"
                className="rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#EFECE4] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {children}
            </div>

            {footer && (
              <div className="border-t border-[#E7E2D8] bg-[#F7F5F0]/70 px-5 py-4 sm:px-6">
                {footer}
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Calm editorial empty state block with warm subtle surface and optional CTA.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-[#E7E2D8] bg-[#EFECE4]/40 px-6 py-10 text-center",
        className
      )}
    >
      {icon && (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#E7E2D8] bg-[#FFFFFF] text-[#57534E]">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-medium text-[#1C1917]">
        {title}
      </h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-xs sm:text-sm text-[#78716C] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export interface SkeletonCardProps {
  lines?: number;
  showHeader?: boolean;
  className?: string;
}

/**
 * Warm paper skeleton loading card matching `#FFFFFF` + `#E7E2D8` layout rhythm.
 */
export function SkeletonCard({
  lines = 3,
  showHeader = true,
  className,
}: SkeletonCardProps) {
  return (
    <Card className={cn("space-y-3", className)}>
      {showHeader && (
        <div className="flex items-center justify-between gap-4">
          <div className="h-4 w-36 rounded-md bg-[#EFECE4] animate-pulse" />
          <div className="h-4 w-16 rounded-full bg-[#EFECE4] animate-pulse" />
        </div>
      )}
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className={cn(
              "h-3.5 rounded-md bg-[#EFECE4] animate-pulse",
              idx === lines - 1 ? "w-2/3" : "w-full"
            )}
          />
        ))}
      </div>
    </Card>
  );
}
