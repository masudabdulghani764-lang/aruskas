import { timingSafeEqual } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { recurringRules } from "@/db/schema";
import { AppError, handleApiError } from "@/lib/errors";
import { applyRecurringRule } from "@/lib/recurring";

function isValidCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return false;
  }
  const provided = authHeader.slice(7).trim();
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

function getTodayWibISO(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Daily Vercel Cron endpoint that idempotently applies all due active recurring
 * rules across user accounts (protected by CRON_SECRET Bearer authentication).
 */
export async function GET(request: Request) {
  try {
    if (!isValidCronSecret(request)) {
      throw new AppError(401, "Akses cron tidak sah.", "UNAUTHORIZED");
    }

    const db = await getDb();
    const todayWib = getTodayWibISO();

    const dueRules = await db
      .select({
        id: recurringRules.id,
        userId: recurringRules.userId,
      })
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.isActive, true),
          lte(recurringRules.nextRunDate, todayWib)
        )
      );

    let applied = 0;
    let skipped = 0;
    let failed = 0;

    for (const rule of dueRules) {
      try {
        await applyRecurringRule(db, rule.id, rule.userId);
        applied += 1;
      } catch (err) {
        if (err instanceof AppError && err.status === 409) {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dateWib: todayWib,
      checked: dueRules.length,
      applied,
      skipped,
      failed,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
