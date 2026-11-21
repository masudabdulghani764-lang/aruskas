import fs from "node:fs";
import path from "node:path";
import { AppError } from "@/lib/errors";

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

function resolveUploadDir(baseDir?: string): string {
  const configured =
    baseDir ??
    (process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim()
      ? process.env.UPLOAD_DIR.trim()
      : path.join(process.cwd(), "data", "uploads"));
  return path.resolve(configured);
}

/**
 * Strips path prefixes, quotes, and control characters from an uploaded filename.
 */
export function sanitizeAttachmentName(rawName: string): string {
  const segments = rawName.split(/[\\/]/);
  const base = segments[segments.length - 1] ?? "";
  const cleaned = base.replace(/[\x00-\x1f\x7f"\\/;]/g, "").trim();
  return cleaned || "lampiran";
}

/**
 * Builds an HTTP-safe Content-Disposition header pairing an ASCII fallback
 * `filename="..."` with RFC 5987 `filename*=UTF-8''...` so Unicode filenames
 * never trigger Headers ByteString TypeErrors.
 */
export function buildContentDisposition(
  rawName: string | null | undefined,
  disposition: "inline" | "attachment" = "inline"
): string {
  const utf8Name = sanitizeAttachmentName(rawName ?? "lampiran");
  const asciiCandidate = utf8Name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]+/g, "_")
    .replace(/["\\/;]/g, "")
    .trim();
  const asciiName =
    asciiCandidate && !/^[._\s]+$/.test(asciiCandidate)
      ? asciiCandidate
      : "lampiran";

  const encodedUtf8 = encodeURIComponent(utf8Name).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedUtf8}`;
}

function resolveSafeAttachmentPath(relPath: string, baseDir?: string): string {
  if (!relPath || relPath.includes("\0") || path.isAbsolute(relPath)) {
    throw new AppError(400, "Path lampiran tidak valid.");
  }

  const uploadDir = resolveUploadDir(baseDir);
  const resolved = path.resolve(uploadDir, relPath);
  const relative = path.relative(uploadDir, resolved);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError(400, "Path lampiran tidak valid.");
  }

  return resolved;
}

/**
 * Validates attachment MIME type and size (<= 2MB), writes it under a UUID filename,
 * and returns its relative storage path, sanitized display name, and MIME type.
 */
export async function saveAttachment(
  file: { name: string; type: string; buffer: Uint8Array },
  baseDir?: string
): Promise<{ path: string; name: string; mime: string }> {
  const mime = file.type.trim().toLowerCase();
  if (!ALLOWED_ATTACHMENT_MIMES.has(mime)) {
    throw new AppError(
      400,
      "Tipe lampiran tidak didukung. Gunakan JPG, PNG, WebP, atau PDF."
    );
  }

  if (file.buffer.byteLength <= 0) {
    throw new AppError(400, "Berkas lampiran tidak boleh kosong.");
  }

  if (file.buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AppError(400, "Ukuran lampiran maksimal 2 MB.");
  }

  const ext = MIME_EXTENSIONS[mime] ?? "";
  const fileName = `${crypto.randomUUID()}${ext}`;
  const uploadDir = resolveUploadDir(baseDir);

  await fs.promises.mkdir(uploadDir, { recursive: true });
  const targetPath = resolveSafeAttachmentPath(fileName, uploadDir);
  await fs.promises.writeFile(targetPath, file.buffer);

  return {
    path: fileName,
    name: sanitizeAttachmentName(file.name),
    mime,
  };
}

/**
 * Reads an attachment buffer safely after guarding against path traversal.
 */
export async function readAttachmentBuffer(
  relPath: string,
  baseDir?: string
): Promise<Uint8Array> {
  const targetPath = resolveSafeAttachmentPath(relPath, baseDir);
  try {
    const data = await fs.promises.readFile(targetPath);
    return new Uint8Array(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new AppError(404, "Berkas lampiran tidak ditemukan.");
    }
    throw err;
  }
}

/**
 * Best-effort cleanup of an uploaded file if a transaction write fails afterwards.
 */
export async function deleteAttachmentQuietly(
  relPath: string,
  baseDir?: string
): Promise<void> {
  try {
    const targetPath = resolveSafeAttachmentPath(relPath, baseDir);
    await fs.promises.unlink(targetPath);
  } catch {
    // Ignore cleanup errors
  }
}
