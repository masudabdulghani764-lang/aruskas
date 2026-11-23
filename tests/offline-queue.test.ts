import { describe, expect, test } from "bun:test";
import { LATEST_ANDROID_APP_RELEASE } from "@/lib/app-version";
import {
  enqueueOfflineTransaction,
  flushOfflineTransactionQueue,
  getOfflineTransactionQueue,
  removeOfflineTransaction,
  type StorageLike,
} from "@/lib/offline-queue";
import fs from "node:fs";
import path from "node:path";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("Web Offline Transaction Queue & APK v1.0.9 Release Integrity", () => {
  test("enqueues offline transactions, flushes in FIFO order, and preserves remaining items on outage", async () => {
    const storage = createMemoryStorage();

    const first = enqueueOfflineTransaction(
      {
        walletId: "w-1",
        targetWalletId: null,
        categoryId: "c-food",
        type: "expense",
        amount: 35_000,
        title: "Makan Siang Offline",
        paymentMethod: "Tunai",
        notes: null,
        occurredAt: "2026-11-23",
      },
      "Dompet Tunai",
      storage
    );

    const second = enqueueOfflineTransaction(
      {
        walletId: "w-1",
        targetWalletId: null,
        categoryId: "c-trans",
        type: "expense",
        amount: 15_000,
        title: "Parkir & Tol",
        paymentMethod: "QRIS",
        notes: null,
        occurredAt: "2026-11-23",
      },
      "Dompet Tunai",
      storage
    );

    expect(getOfflineTransactionQueue(storage).length).toBe(2);

    // 1st succeeds (201), 2nd drops off network (throws TypeError) -> 2nd stays in queue!
    let calls = 0;
    const partialRes = await flushOfflineTransactionQueue({
      storage,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) {
          return new Response(JSON.stringify({ ok: true }), { status: 201 });
        }
        throw new TypeError("Failed to fetch");
      },
    });

    expect(partialRes).toEqual({ synced: 1, failed: 0, remaining: 1 });
    const left = getOfflineTransactionQueue(storage);
    expect(left.length).toBe(1);
    expect(left[0].tempId).toBe(second.tempId);

    // Next flush succeeds completely
    const finalRes = await flushOfflineTransactionQueue({
      storage,
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 201 }),
    });
    expect(finalRes).toEqual({ synced: 1, failed: 0, remaining: 0 });
    expect(getOfflineTransactionQueue(storage).length).toBe(0);

    // Manual removal helper works cleanly
    const extra = enqueueOfflineTransaction(first.payload, "Dompet Tunai", storage);
    expect(getOfflineTransactionQueue(storage).length).toBe(1);
    removeOfflineTransaction(extra.tempId, storage);
    expect(getOfflineTransactionQueue(storage).length).toBe(0);
  });

  test("APK v1.0.9 file exists with valid ZIP/APK magic bytes matching metadata", () => {
    const apkPath = path.join(process.cwd(), "public", "downloads", "ArusKas.apk");
    expect(fs.existsSync(apkPath)).toBe(true);
    const bytes = fs.readFileSync(apkPath);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(LATEST_ANDROID_APP_RELEASE.versionName).toBe("1.0.9");
    expect(LATEST_ANDROID_APP_RELEASE.versionCode).toBe(10);
  });
});
