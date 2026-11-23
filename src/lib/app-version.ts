export interface AndroidAutoCatatStatus {
  supported: boolean;
  notificationAccess: boolean;
  enabled: boolean;
  hasToken: boolean;
  includeExtraApps: boolean;
  customAppsMode?: boolean;
  selectedAppsCount?: number;
  capturedCount: number;
  pendingCount: number;
  lastStatus: string;
  lastApp: string;
  lastAt: string;
}

export interface AndroidInstalledApp {
  packageName: string;
  label: string;
  isRecommended: boolean;
  selected: boolean;
}

export interface ArusKasNativeBridge {
  isSupported?: () => boolean;
  isAppLockEnabled?: () => boolean;
  setAppLockEnabled?: (enabled: boolean) => boolean;
  isAutoCatatSupported?: () => boolean;
  isNotificationAccessGranted?: () => boolean;
  openNotificationAccessSettings?: () => boolean;
  openAppInfoSettings?: () => boolean;
  isAutoCatatEnabled?: () => boolean;
  hasAutoCatatToken?: () => boolean;
  isIncludeExtraAppsEnabled?: () => boolean;
  setIncludeExtraAppsEnabled?: (enabled: boolean) => boolean;
  configureAutoCatat?: (rawToken: string, enabled: boolean) => boolean;
  setAutoCatatEnabled?: (enabled: boolean) => boolean;
  getAutoCatatStatusJson?: () => string;
  getInstalledAppsJson?: () => string;
  setSelectedAppsJson?: (selectedMapJson: string) => boolean;
  resetSelectedAppsDefault?: () => boolean;
}

declare global {
  interface Window {
    ArusKasNative?: ArusKasNativeBridge;
  }
}

export interface AndroidAppRelease {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  sizeLabel: string;
  highlights: string[];
}

export const LATEST_ANDROID_APP_RELEASE: AndroidAppRelease = {
  versionName: "1.0.8",
  versionCode: 9,
  apkUrl: "/downloads/ArusKas.apk",
  sizeLabel: "218 KB",
  highlights: [
    "Pemilih Aplikasi HP: centang langsung aplikasi bank/e-wallet yang terpasang di HP Anda",
    "Filter anti-promo pintar: memblokir notifikasi promo/voucher palsu seperti 'cuma Rp 1' dari Gojek/Shopee",
    "Otomatis mendeteksi 15+ bank & e-wallet + antrean offline & pengamanan sidik jari/PIN",
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
