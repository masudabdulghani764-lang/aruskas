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
