export interface AndroidAppRelease {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  sizeLabel: string;
  highlights: string[];
}

export const LATEST_ANDROID_APP_RELEASE: AndroidAppRelease = {
  versionName: "1.0.6",
  versionCode: 7,
  apkUrl: "/downloads/ArusKas.apk",
  sizeLabel: "205 KB",
  highlights: [
    "Animasi pembuka baru: 2 garis logo masuk satu per satu tanpa spinner",
    "Transisi keluar sinematik: 2 garis melesat keluar & halaman bergeser mengikuti arus garis",
    "Logo W1 Clean, Kunci Sidik Jari/PIN HP, & seluruh pengamanan terbaru",
  ],
};

/**
 * Extracts the installed ArusKas Android APK semver string from a User-Agent header.
 * Returns null for regular web browsers or iOS devices.
 */
export function parseAndroidAppVersion(userAgent: string): string | null {
  const match = /ArusKasApp\/(\d+\.\d+\.\d+)/i.exec(userAgent);
  return match ? match[1] : null;
}

/**
 * Compares two `major.minor.patch` semver strings.
 * Returns -1 when current < latest, 0 when equal, 1 when current > latest.
 */
export function compareSemver(current: string, latest: string): -1 | 0 | 1 {
  const a = current.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const b = latest.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length, 3);

  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Evaluates whether the running Android APK should be prompted to update.
 */
export function checkAndroidAppUpdate(
  userAgent: string,
  latestVersionName = LATEST_ANDROID_APP_RELEASE.versionName
): {
  isAndroidApk: boolean;
  installedVersion: string | null;
  needsUpdate: boolean;
} {
  const installedVersion = parseAndroidAppVersion(userAgent);
  if (!installedVersion) {
    return {
      isAndroidApk: false,
      installedVersion: null,
      needsUpdate: false,
    };
  }
  return {
    isAndroidApk: true,
    installedVersion,
    needsUpdate: compareSemver(installedVersion, latestVersionName) < 0,
  };
}
