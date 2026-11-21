const SAFE_BASE_ORIGIN = "https://aruskas.local";
const DEFAULT_NEXT_PATH = "/dashboard";

/**
 * Validates and normalizes an internal post-authentication redirect path,
 * rejecting external origins, protocol-relative URLs, backslashes, and control characters.
 */
export function resolveSafeNext(rawNext: string | null | undefined): string {
  if (!rawNext || typeof rawNext !== "string") {
    return DEFAULT_NEXT_PATH;
  }

  if (!/^\/(?![/\\])/.test(rawNext)) {
    return DEFAULT_NEXT_PATH;
  }

  const pathOnly = rawNext.split(/[?#]/)[0] ?? "";
  if (/[\x00-\x1f\x7f\\]/.test(pathOnly) || /[\x00-\x1f\x7f]/.test(rawNext)) {
    return DEFAULT_NEXT_PATH;
  }

  try {
    const parsed = new URL(rawNext, SAFE_BASE_ORIGIN);
    if (
      parsed.origin !== SAFE_BASE_ORIGIN ||
      !/^\/(?![/\\])/.test(parsed.pathname)
    ) {
      return DEFAULT_NEXT_PATH;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}
