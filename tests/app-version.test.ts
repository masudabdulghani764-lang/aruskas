import { describe, expect, test } from "bun:test";
import {
  checkAndroidAppUpdate,
  compareSemver,
  parseAndroidAppVersion,
} from "@/lib/app-version";

describe("In-App Android APK Auto Update Checker", () => {
  test("parses ArusKasApp/x.y.z from User-Agent and ignores regular browsers", () => {
    expect(
      parseAndroidAppVersion(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 ArusKasApp/1.0.2"
      )
    ).toBe("1.0.2");
    expect(
      parseAndroidAppVersion(
        "Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36"
      )
    ).toBeNull();
  });

  test("compares semver accurately across major/minor/patch", () => {
    expect(compareSemver("1.0.2", "1.0.3")).toBe(-1);
    expect(compareSemver("1.0.3", "1.0.3")).toBe(0);
    expect(compareSemver("1.0.4", "1.0.3")).toBe(1);
    expect(compareSemver("1.0.9", "1.0.10")).toBe(-1);
    expect(compareSemver("1.1.0", "1.0.99")).toBe(1);
  });

  test("prompts update only for outdated Android APK versions", () => {
    const outdated = checkAndroidAppUpdate("Android WebView ArusKasApp/1.0.2", "1.0.3");
    expect(outdated).toEqual({
      isAndroidApk: true,
      installedVersion: "1.0.2",
      needsUpdate: true,
    });

    const latest = checkAndroidAppUpdate("Android WebView ArusKasApp/1.0.3", "1.0.3");
    expect(latest).toEqual({
      isAndroidApk: true,
      installedVersion: "1.0.3",
      needsUpdate: false,
    });

    const chrome = checkAndroidAppUpdate("Mozilla/5.0 Chrome/130.0", "1.0.3");
    expect(chrome).toEqual({
      isAndroidApk: false,
      installedVersion: null,
      needsUpdate: false,
    });
  });
});
