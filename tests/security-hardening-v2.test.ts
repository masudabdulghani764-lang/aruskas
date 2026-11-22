import { describe, expect, test } from "bun:test";
import { createDb } from "@/db";
import {
  decodeAttachmentFromDb,
  prepareAttachmentForDb,
} from "@/lib/attachments";
import {
  listUserSecurityEvents,
  maskIpAddress,
  recordSecurityEvent,
  summarizeUserAgent,
} from "@/lib/audit-log";
import { registerUser } from "@/lib/auth";
import {
  decryptVaultValue,
  encryptVaultValue,
  isEncryptedVaultValue,
} from "@/lib/crypto-vault";
import {
  buildTotpOtpAuthUri,
  createTwoFactorChallengeToken,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
  verifyTwoFactorChallengeToken,
} from "@/lib/totp";

describe("Security Hardening Wave 2: AES-256-GCM Vault, 2FA TOTP & Security Audit Logs", () => {
  test("AES-256-GCM vault encrypts/decrypts, preserves legacy plaintext, and rejects tampering", () => {
    const encrypted = encryptVaultValue("rahasia-keuangan-123", "test-purpose");
    expect(isEncryptedVaultValue(encrypted)).toBe(true);
    expect(encrypted).not.toContain("rahasia-keuangan-123");
    expect(decryptVaultValue(encrypted, "test-purpose")).toBe(
      "rahasia-keuangan-123"
    );

    // Wrong purpose key must throw
    expect(() => decryptVaultValue(encrypted, "other-purpose")).toThrow();

    // Legacy plaintext/base64 passes through transparently
    expect(decryptVaultValue("legacy-base64-value", "test-purpose")).toBe(
      "legacy-base64-value"
    );
  });

  test("Transaction attachments are encrypted at rest with AES-256-GCM and decode cleanly", () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
    ]);
    const prepared = prepareAttachmentForDb({
      name: "struk-kopi.png",
      type: "image/png",
      buffer: pngBytes,
    });

    expect(isEncryptedVaultValue(prepared.dataBase64)).toBe(true);
    const decoded = decodeAttachmentFromDb(prepared.dataBase64);
    expect(Array.from(decoded)).toEqual(Array.from(pngBytes));

    // Legacy unencrypted base64 rows remain readable
    const legacyDecoded = decodeAttachmentFromDb(
      Buffer.from(pngBytes).toString("base64")
    );
    expect(Array.from(legacyDecoded)).toEqual(Array.from(pngBytes));
  });

  test("RFC 6238 TOTP 2FA generates/verifies 6-digit codes, encrypts secrets, and validates challenge tokens", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    const uri = buildTotpOtpAuthUri({
      email: "user@aruskas.id",
      secret,
    });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=ArusKas");

    const now = 1_700_000_000_000;
    const code = generateTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, { timestampMs: now })).toBe(true);
    // ±1 step tolerance (30s)
    expect(verifyTotpCode(secret, code, { timestampMs: now + 30_000 })).toBe(
      true
    );
    // Out-of-window (90s away) rejected
    expect(verifyTotpCode(secret, code, { timestampMs: now + 90_000 })).toBe(
      false
    );
    expect(verifyTotpCode(secret, "000000", { timestampMs: now })).toBe(
      code === "000000"
    );

    const encSecret = encryptTotpSecret(secret);
    expect(isEncryptedVaultValue(encSecret)).toBe(true);
    expect(decryptTotpSecret(encSecret)).toBe(secret);

    const challenge = createTwoFactorChallengeToken("user-abc");
    const parsed = verifyTwoFactorChallengeToken(challenge);
    expect(parsed?.userId).toBe("user-abc");
    expect(verifyTwoFactorChallengeToken(`${challenge}tamper`)).toBeNull();
  });

  test("Security audit logs record events with masked IPs and device labels", async () => {
    expect(maskIpAddress("114.122.45.89")).toBe("114.122.45.xxx");
    expect(maskIpAddress("2001:db8:85a3::8a2e:370:7334")).toBe(
      "2001:db8:85a3:xxxx"
    );
    expect(summarizeUserAgent("Mozilla/5.0 Android ArusKasApp/1.0.3")).toBe(
      "Aplikasi Android ArusKas"
    );

    const { db, close } = await createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Rina",
        email: "rina-sec@aruskas.test",
        password: "StrongPassword123!",
      });

      await recordSecurityEvent(db, {
        userId: reg.user.id,
        eventType: "login_success",
        ipAddress: "180.244.12.99",
        userAgent: "Mozilla/5.0 (Linux; Android 14) ArusKasApp/1.0.3",
        metadata: "Login terverifikasi 2FA",
      });
      await recordSecurityEvent(db, {
        userId: reg.user.id,
        eventType: "totp_enabled",
        ipAddress: "180.244.12.99",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0",
        metadata: "2FA Authenticator diaktifkan",
      });

      const events = await listUserSecurityEvents(db, reg.user.id, 10);
      expect(events).toHaveLength(2);
      expect(events[0].ipMasked).toBe("180.244.12.xxx");
      const labels = events.map((e) => e.deviceLabel);
      expect(labels).toContain("Aplikasi Android ArusKas");
      expect(labels).toContain("Chrome · Windows");
    } finally {
      await close();
    }
  });
});
