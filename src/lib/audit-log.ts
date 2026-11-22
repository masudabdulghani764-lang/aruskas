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

function cleanClientHint(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/^"+|"+$/g, "").trim();
}

/**
 * Builds an enriched User-Agent string combining the raw User-Agent with
 * Chromium Client Hints (`Sec-CH-UA-Model`, `Sec-CH-UA-Platform-Version`) when available.
 */
export function getEnrichedUserAgent(request: Request): string | null {
  const ua = request.headers.get("user-agent")?.trim() ?? "";
  const chModel = cleanClientHint(request.headers.get("sec-ch-ua-model"));
  const chPlatformVer = cleanClientHint(
    request.headers.get("sec-ch-ua-platform-version")
  );

  const hints: string[] = [];
  if (chModel && chModel !== "K") {
    hints.push(`CHModel/${chModel}`);
  }
  if (chPlatformVer) {
    hints.push(`CHVer/${chPlatformVer.split(".")[0]}`);
  }

  if (!ua && hints.length === 0) return null;
  return hints.length > 0 ? `${ua} ${hints.join(" ")}`.trim() : ua;
}

function formatAndroidModelName(rawModel: string): string {
  const cleaned = rawModel
    .replace(/\s+Build\/[^\s;)]+/i, "")
    .replace(/;\s*wv$/i, "")
    .trim();

  if (
    !cleaned ||
    cleaned.length < 2 ||
    /^(K|wv|Mobile|Linux|Android|U|en-[A-Z]{2}|id-[A-Z]{2})$/i.test(cleaned)
  ) {
    return "";
  }

  if (/^SM-[A-Z0-9]+/i.test(cleaned)) return `Samsung ${cleaned}`;
  if (/^RMX\d+/i.test(cleaned)) return `Realme ${cleaned}`;
  if (/^CPH\d+/i.test(cleaned)) return `OPPO ${cleaned}`;
  if (/^V\d{4}[A-Z]?$/i.test(cleaned)) return `vivo ${cleaned}`;
  return cleaned;
}

/**
 * Extracts a readable device/phone model and platform summary from a User-Agent
 * (including Android WebView model codes and Chromium Client Hints).
 */
export function summarizeUserAgent(ua: string | null | undefined): string {
  const raw = ua?.trim() ?? "";
  if (!raw) return "Perangkat tidak dikenal";

  const apkMatch = /ArusKasApp\/(\d+\.\d+\.\d+)/i.exec(raw);
  const chModelMatch = /CHModel\/([^;\n\r]+?)(?:\s+CHVer\/|$)/i.exec(raw);
  const chVerMatch = /CHVer\/(\d+)/i.exec(raw);

  // Extract Android OS version and model from standard Android / WebView UA
  let androidVer = chVerMatch ? chVerMatch[1] : "";
  let model = chModelMatch ? formatAndroidModelName(chModelMatch[1]) : "";

  const androidUaMatch = /Android(?:\s+([\d.]+))?(?:\s*;\s*([^;)]+))?/i.exec(raw);
  if (androidUaMatch) {
    if (!androidVer && androidUaMatch[1]) {
      androidVer = androidUaMatch[1].split(".")[0];
    }
    if (!model && androidUaMatch[2]) {
      model = formatAndroidModelName(androidUaMatch[2]);
    }
  }

  if (apkMatch) {
    const verSuffix = androidVer ? ` (Android ${androidVer})` : "";
    if (model) {
      return `${model}${verSuffix} · APK v${apkMatch[1]}`;
    }
    return "Aplikasi Android ArusKas";
  }

  const isAndroid = /Android/i.test(raw);
  const isIpad = /iPad/i.test(raw);
  const isIphone = /iPhone/i.test(raw);
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

  if (isAndroid) {
    const osPart = androidVer ? `Android ${androidVer}` : "Android";
    if (model) {
      return `${model} (${osPart}) · ${browser}`;
    }
    return `${browser} · ${osPart}`;
  }

  if (isIphone) return `iPhone · ${browser}`;
  if (isIpad) return `iPad · ${browser}`;

  const os = isWindows
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
      userAgent: params.userAgent?.slice(0, 260) ?? null,
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
