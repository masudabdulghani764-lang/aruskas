import { createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { AppDb } from "@/db";
import { rateLimits } from "@/db/schema";
import { AppError } from "@/lib/errors";

/**
 * Extracts a normalized client IP address from standard proxy/Vercel headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return "local";
}

function hashRateLimitKey(scope: string, identifier: string): string {
  const digest = createHash("sha256")
    .update(`${scope}:${identifier}`)
    .digest("hex");
  return `${scope}:${digest.slice(0, 32)}`;
}

/**
 * Enforces a PostgreSQL-backed fixed-window rate limit that works consistently
 * across serverless instances on Vercel. Throws AppError(429) when exceeded.
 */
export async function enforceRateLimit(
  db: AppDb,
  options: {
    scope: string;
    identifier: string;
    limit: number;
    windowMs: number;
    message?: string;
  }
): Promise<{ remaining: number; resetAt: number }> {
  const now = Date.now();
  const key = hashRateLimitKey(options.scope, options.identifier);

  // Opportunistic prune (~5% of calls) so the rate_limits table stays compact
  if (Math.random() < 0.05) {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.resetAt, now))
      .catch(() => undefined);
  }

  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 1, resetAt },
      });
    return { remaining: Math.max(0, options.limit - 1), resetAt };
  }

  if (existing.count >= options.limit) {
    throw new AppError(
      429,
      options.message ??
        "Terlalu banyak percobaan. Silakan tunggu beberapa menit lalu coba lagi.",
      "RATE_LIMITED"
    );
  }

  const nextCount = existing.count + 1;
  await db
    .update(rateLimits)
    .set({ count: nextCount })
    .where(eq(rateLimits.key, key));

  return {
    remaining: Math.max(0, options.limit - nextCount),
    resetAt: existing.resetAt,
  };
}

/**
 * Validates that a browser-originated mutating request matches the application's
 * own host (defense-in-depth CSRF check alongside HttpOnly SameSite=Lax cookies).
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const hostHeader = request.headers.get("host")?.trim().toLowerCase();

  let requestHost = forwardedHost || hostHeader;
  if (!requestHost) {
    try {
      requestHost = new URL(request.url).host.toLowerCase();
    } catch {
      return false;
    }
  }

  return originHost === requestHost;
}
