export interface OfflineTransactionPayload {
  walletId: string;
  targetWalletId: string | null;
  categoryId: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  title: string;
  paymentMethod: string | null;
  notes: string | null;
  occurredAt: string;
}

export interface OfflineQueuedTransaction {
  tempId: string;
  queuedAt: string;
  walletName: string;
  payload: OfflineTransactionPayload;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const OFFLINE_QUEUE_KEY = "aruskas_offline_tx_queue_v1";
const OFFLINE_QUEUE_EVENT = "aruskas:offline-queue-changed";
const MAX_OFFLINE_ITEMS = 40;

function resolveStorage(customStorage?: StorageLike): StorageLike | null {
  if (customStorage) return customStorage;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function emitQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  }
}

export { OFFLINE_QUEUE_EVENT };

/**
 * Reads all queued offline transactions safely from storage.
 */
export function getOfflineTransactionQueue(
  customStorage?: StorageLike
): OfflineQueuedTransaction[] {
  const storage = resolveStorage(customStorage);
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OfflineQueuedTransaction =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as OfflineQueuedTransaction).tempId === "string" &&
        Boolean((item as OfflineQueuedTransaction).payload)
    );
  } catch {
    return [];
  }
}

function writeOfflineTransactionQueue(
  items: OfflineQueuedTransaction[],
  customStorage?: StorageLike
) {
  const storage = resolveStorage(customStorage);
  if (!storage) return;
  try {
    if (items.length === 0) {
      storage.removeItem(OFFLINE_QUEUE_KEY);
    } else {
      storage.setItem(
        OFFLINE_QUEUE_KEY,
        JSON.stringify(items.slice(-MAX_OFFLINE_ITEMS))
      );
    }
    emitQueueChanged();
  } catch {
    // Ignore storage quota errors cleanly
  }
}

/**
 * Adds a transaction created while offline to the local retry queue.
 */
export function enqueueOfflineTransaction(
  payload: OfflineTransactionPayload,
  walletName: string,
  customStorage?: StorageLike
): OfflineQueuedTransaction {
  const current = getOfflineTransactionQueue(customStorage);
  const item: OfflineQueuedTransaction = {
    tempId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    walletName,
    payload,
  };
  writeOfflineTransactionQueue([...current, item], customStorage);
  return item;
}

/**
 * Removes a single queued transaction by its temporary ID.
 */
export function removeOfflineTransaction(
  tempId: string,
  customStorage?: StorageLike
): void {
  const current = getOfflineTransactionQueue(customStorage);
  writeOfflineTransactionQueue(
    current.filter((item) => item.tempId !== tempId),
    customStorage
  );
}

/**
 * Sequentially flushes queued offline transactions to `/api/transactions`.
 * Stops immediately on network outage so order is preserved, while discarding
 * client-invalid (4xx) payloads with a clear error count.
 */
export type OfflineFetchFn = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export async function flushOfflineTransactionQueue(opts?: {
  storage?: StorageLike;
  fetchImpl?: OfflineFetchFn;
}): Promise<{ synced: number; failed: number; remaining: number }> {
  const storage = resolveStorage(opts?.storage);
  const fetcher: OfflineFetchFn = opts?.fetchImpl ?? ((input, init) => fetch(input, init));
  const initial = getOfflineTransactionQueue(storage ?? undefined);
  if (initial.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  let synced = 0;
  let failed = 0;
  const remaining: OfflineQueuedTransaction[] = [];

  for (let i = 0; i < initial.length; i++) {
    const item = initial[i];
    try {
      const res = await fetcher("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        synced++;
      } else if (res.status >= 400 && res.status < 500) {
        // Validation/authorization error — don't trap queue permanently
        failed++;
      } else {
        // 5xx server transient — keep this and subsequent items in order
        remaining.push(...initial.slice(i));
        break;
      }
    } catch {
      // Still offline — preserve queue intact
      remaining.push(...initial.slice(i));
      break;
    }
  }

  writeOfflineTransactionQueue(remaining, storage ?? undefined);
  return { synced, failed, remaining: remaining.length };
}
