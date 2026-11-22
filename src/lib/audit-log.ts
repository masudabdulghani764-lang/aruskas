import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { securityAuditLogs } from "@/db/schema";

export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "login_2fa_challenge"
  | "login_google"
  | "register"
  | "password_changed"
  | "password_reset"
  | "sessions_revoked"
  | "totp_enabled"
  | "totp_disabled"
  | "backup_exported"
  | "backup_restored"
  | "webhook_rotated";

export type SecurityAuditLogItem = {
  id: string;
  eventType: string;
  ipMasked: string;
  deviceLabel: string;
  metadata: string | null;
  createdAt: string;
};

/**
 * Masks the last octet/segments of an IP address for privacy-conscious display.
 */
export function maskIpAddress(rawIp: string | null | undefined): string {
  const ip = rawIp?.trim() ?? "";
  if (!ip || ip === "local") return "Lokal";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 3).join(":")}:xxxx`;
  }
  return "Tersembunyi";
}

/**
 * Summarizes a User-Agent header into a readable Indonesian device label.
 */
export function summarizeUserAgent(ua: string | null | undefined): string {
  const raw = ua?.trim() ?? "";
  if (!raw) return "Perangkat tidak dikenal";
  if (raw.includes("ArusKasApp/")) return "Aplikasi Android ArusKas";

  const isAndroid = /Android/i.test(raw);
  const isIphone = /iPhone|iPad/i.test(raw);
  const isWindows = /Windows/i.test(raw);
  const isMac = /Macintosh|Mac OS/i.test(raw);
  const isLinux = /Linux/i.test(raw) && !isAndroid;

  const browser = /Edg\//i.test(raw)
    ? "Edge"
    : /Chrome\//i.test(raw)
      ? "Chrome"
      : /Safari\//i.test(raw) && !/Chrome/i.test(raw)
        ? "Safari"
        : /Firefox\//i.test(raw)
          ? "Firefox"
          : "Browser";

  const os = isAndroid
    ? "Android"
    : isIphone
      ? "iOS"
      : isWindows
        ? "Windows"
        : isMac
          ? "macOS"
          : isLinux
            ? "Linux"
            : "Web";

  return `${browser} · ${os}`;
}

/**
 * Persists a security audit log entry. Never throws to callers so audit failures
 * cannot break authentication flows.
 */
export async function recordSecurityEvent(
  db: AppDb,
  params: {
    userId: string;
    eventType: SecurityEventType;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: string | null;
  }
): Promise<void> {
  try {
    await db.insert(securityAuditLogs).values({
      id: crypto.randomUUID(),
      userId: params.userId,
      eventType: params.eventType,
      ipMasked: maskIpAddress(params.ipAddress),
      userAgent: params.userAgent?.slice(0, 220) ?? null,
      metadata: params.metadata?.slice(0, 240) ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[audit-log] failed to record security event:", err);
  }
}

/**
 * Returns the latest security audit events for a user (newest first).
 */
export async function listUserSecurityEvents(
  db: AppDb,
  userId: string,
  limit = 20
): Promise<SecurityAuditLogItem[]> {
  const safeLimit = Math.max(1, Math.min(50, limit));
  const rows = await db
    .select()
    .from(securityAuditLogs)
    .where(eq(securityAuditLogs.userId, userId))
    .orderBy(desc(securityAuditLogs.createdAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    ipMasked: row.ipMasked,
    deviceLabel: summarizeUserAgent(row.userAgent),
    metadata: row.metadata,
    createdAt: row.createdAt,
  }));
}
