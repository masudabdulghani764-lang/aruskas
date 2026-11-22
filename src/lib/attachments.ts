import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptVaultValue, encryptVaultValue } from "@/lib/crypto-vault";
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

/**
 * Verifies the actual leading magic bytes of an uploaded buffer match the declared MIME type,
 * blocking spoofed files (e.g. HTML/JS disguised as image/png).
 */
export function assertAttachmentMagicBytes(
  mime: string,
  buffer: Uint8Array
): void {
  const invalid = () =>
    new AppError(
      400,
      "Isi berkas tidak sesuai dengan format JPG, PNG, WebP, atau PDF yang valid."
    );

  if (mime === "image/png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.byteLength < sig.length || !sig.every((b, i) => buffer[i] === b)) {
      throw invalid();
    }
    return;
  }

  if (mime === "image/jpeg") {
    if (
      buffer.byteLength < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      throw invalid();
    }
    return;
  }

  if (mime === "image/webp") {
    if (
      buffer.byteLength < 12 ||
      buffer[0] !== 0x52 || // R
      buffer[1] !== 0x49 || // I
      buffer[2] !== 0x46 || // F
      buffer[3] !== 0x46 || // F
      buffer[8] !== 0x57 || // W
      buffer[9] !== 0x45 || // E
      buffer[10] !== 0x42 || // B
      buffer[11] !== 0x50 // P
    ) {
      throw invalid();
    }
    return;
  }

  if (mime === "application/pdf") {
    if (
      buffer.byteLength < 5 ||
      buffer[0] !== 0x25 || // %
      buffer[1] !== 0x50 || // P
      buffer[2] !== 0x44 || // D
      buffer[3] !== 0x46 || // F
      buffer[4] !== 0x2d // -
    ) {
      throw invalid();
    }
  }
}

function resolveUploadDir(baseDir?: string): string {
  const defaultUploads = process.env.VERCEL
    ? path.join(os.tmpdir(), "aruskas-uploads")
    : path.join(process.cwd(), "data", "uploads");
  const configured =
    baseDir ??
    (process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim()
      ? process.env.UPLOAD_DIR.trim()
      : defaultUploads);
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

/**
 * Validates an uploaded receipt attachment (MIME type & <= 2 MB) and returns
 * its metadata + base64 payload for persistent PostgreSQL storage.
 */
export function prepareAttachmentForDb(file: {
  name: string;
  type: string;
  buffer: Uint8Array;
}): { path: string; name: string; mime: string; dataBase64: string } {
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

  assertAttachmentMagicBytes(mime, file.buffer);

  const ext = MIME_EXTENSIONS[mime] ?? "";
  const rawBase64 = Buffer.from(file.buffer).toString("base64");
  return {
    path: `db:${crypto.randomUUID()}${ext}`,
    name: sanitizeAttachmentName(file.name),
    mime,
    dataBase64: encryptVaultValue(rawBase64, "attachment"),
  };
}

/**
 * Decodes a stored `transaction_attachments.data` value (AES-256-GCM encrypted or
 * legacy plaintext base64) back into raw binary bytes.
 */
export function decodeAttachmentFromDb(stored: string): Uint8Array {
  const base64 = decryptVaultValue(stored, "attachment");
  return new Uint8Array(Buffer.from(base64, "base64"));
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

  assertAttachmentMagicBytes(mime, file.buffer);

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
 * Best-effort cleanup of a filesystem uploaded file if present (no-op for `db:` stored rows).
 */
export async function deleteAttachmentQuietly(
  relPath: string,
  baseDir?: string
): Promise<void> {
  if (relPath.startsWith("db:")) {
    return;
  }
  try {
    const targetPath = resolveSafeAttachmentPath(relPath, baseDir);
    await fs.promises.unlink(targetPath);
  } catch {
    // Ignore cleanup errors
  }
}
