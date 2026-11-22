import { describe, expect, test } from "bun:test";
import {
  createMobileAuthHandoffToken,
  isValidMobileNonce,
  verifyMobileAuthHandoffToken,
} from "@/lib/google-oauth";

describe("Mobile OAuth Handoff Token (AES-256-GCM + Nonce Binding)", () => {
  test("validates nonce format and verifies valid handoff token round-trip", () => {
    const nonce = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(isValidMobileNonce(nonce)).toBe(true);
    expect(isValidMobileNonce("short")).toBe(false);
    expect(isValidMobileNonce("not-hex-zzzzzzzzzzzzzzzz")).toBe(false);

    const token = createMobileAuthHandoffToken({
      userId: "user-12345",
      nonce,
    });
    expect(token.length).toBeGreaterThan(40);

    const verified = verifyMobileAuthHandoffToken(token, nonce);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("user-12345");
    expect(verified?.jti).toHaveLength(32);
  });

  test("rejects mismatched nonce or tampered ciphertext", () => {
    const nonce = "0123456789abcdef0123456789abcdef";
    const wrongNonce = "fedcba9876543210fedcba9876543210";

    const token = createMobileAuthHandoffToken({
      userId: "user-999",
      nonce,
    });

    expect(verifyMobileAuthHandoffToken(token, wrongNonce)).toBeNull();

    const tampered = `${token.slice(0, -4)}AAAA`;
    expect(verifyMobileAuthHandoffToken(tampered, nonce)).toBeNull();
  });
});
