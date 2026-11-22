import crypto from "node:crypto";

const ENC_PREFIX = "enc:v1:";

function deriveVaultKey(purpose: string): Buffer {
  const rootSecret =
    process.env.APP_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "aruskas-local-dev-vault-key";
  return crypto
    .createHash("sha256")
    .update(`${rootSecret}|aruskas-vault-v1|${purpose}`)
    .digest();
}

/**
 * Encrypts a UTF-8 plaintext string using AES-256-GCM with a random 96-bit IV.
 * Output format: `enc:v1:<base64url(iv || authTag || ciphertext)>`.
 */
export function encryptVaultValue(plaintext: string, purpose = "default"): string {
  const key = deriveVaultKey(purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString("base64url")}`;
}

/**
 * Decrypts a vault value produced by `encryptVaultValue`.
 * If the stored value does not start with `enc:v1:` (legacy plaintext/base64),
 * returns it unchanged so migrations stay 100% backward-compatible.
 */
export function decryptVaultValue(stored: string, purpose = "default"): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }

  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64url");
  if (raw.length <= 28) {
    throw new Error("Encrypted vault payload is malformed.");
  }

  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const key = deriveVaultKey(purpose);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}

export function isEncryptedVaultValue(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
