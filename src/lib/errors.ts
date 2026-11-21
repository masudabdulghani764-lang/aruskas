import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Domain error carrying an HTTP status code and optional machine-readable code.
 */
export class AppError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Detects PostgreSQL unique constraint violations (SQLSTATE 23505), inspecting
 * both top-level and Drizzle-wrapped `.cause` errors, optionally matching a constraint hint.
 */
export function isPgUniqueViolation(
  err: unknown,
  constraintHint?: string
): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const candidates = [
    err as Record<string, unknown>,
    ((err as Record<string, unknown>).cause ?? null) as Record<
      string,
      unknown
    > | null,
  ].filter(Boolean) as Record<string, unknown>[];

  let isUnique = false;
  let haystack = "";

  for (const item of candidates) {
    if (item.code === "23505") {
      isUnique = true;
    }
    if (typeof item.constraint === "string") {
      haystack += ` ${item.constraint.toLowerCase()}`;
    }
    if (typeof item.detail === "string") {
      haystack += ` ${item.detail.toLowerCase()}`;
    }
    if (typeof item.message === "string") {
      const msgLower = item.message.toLowerCase();
      haystack += ` ${msgLower}`;
      if (
        msgLower.includes("duplicate key value violates unique constraint") ||
        msgLower.includes("unique constraint failed")
      ) {
        isUnique = true;
      }
    }
  }

  if (!isUnique) {
    return false;
  }
  if (!constraintHint) {
    return true;
  }
  return haystack.includes(constraintHint.toLowerCase());
}

/**
 * Converts domain, Zod validation, or unexpected errors into standardized
 * Indonesian JSON HTTP responses.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      },
      { status: err.status }
    );
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Data yang dikirim tidak valid.";
    return NextResponse.json(
      {
        error: message,
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      error: "Terjadi kesalahan pada server.",
    },
    { status: 500 }
  );
}
