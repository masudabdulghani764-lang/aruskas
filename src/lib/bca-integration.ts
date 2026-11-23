import crypto from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { AppDb } from "@/db";
import {
  bankIntegrations,
  bankSyncLogs,
  categories,
  transactions,
  wallets,
} from "@/db/schema";
import {
  buildBcaDedupeHash,
  extractTransactionReference,
  parseBcaCsv,
  parseBcaNotification,
  suggestBcaCategoryId,
  type ParsedBcaEntry,
} from "@/lib/bca-parser";
import { AppError, isPgUniqueViolation } from "@/lib/errors";
import {
  assertValidIsoDate,
  insertTransactionInExecutor,
  type TransactionView,
} from "@/lib/transactions";
import { assertWalletAccess } from "@/lib/wallets";

export type BcaIntegrationView = {
  id: string;
  provider: "bca";
  walletId: string;
  walletName: string;
  providerWalletMap: Record<string, string>;
  tokenPrefix: string;
  isActive: boolean;
  autoCategorize: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BcaSyncLogView = {
  id: string;
  walletId: string;
  walletName: string;
  source: "webhook_email" | "webhook_push" | "csv_import" | "simulator";
  transactionId: string | null;
  status: "imported" | "duplicate" | "failed";
  rawSnippet: string;
  errorMessage: string | null;
  createdAt: string;
};

export type BcaCsvPreviewRow = ParsedBcaEntry & {
  dedupeHash: string;
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  isDuplicate: boolean;
};

function hashWebhookToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateWebhookToken(): {
  rawToken: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const rawToken = `bca_live_${crypto.randomBytes(24).toString("hex")}`;
  return {
    rawToken,
    tokenHash: hashWebhookToken(rawToken),
    tokenPrefix: `${rawToken.slice(0, 15)}••••${rawToken.slice(-4)}`,
  };
}

function parseProviderWalletMap(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        clean[k.trim().toLowerCase()] = v.trim();
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function toIntegrationView(
  row: typeof bankIntegrations.$inferSelect,
  walletName: string
): BcaIntegrationView {
  return {
    id: row.id,
    provider: row.provider,
    walletId: row.walletId,
    walletName,
    providerWalletMap: parseProviderWalletMap(row.providerWalletMap),
    tokenPrefix: row.tokenPrefix,
    isActive: row.isActive,
    autoCategorize: row.autoCategorize,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getBcaIntegration(
  db: AppDb,
  userId: string
): Promise<{ integration: BcaIntegrationView | null; logs: BcaSyncLogView[] }> {
  const [[row], rawLogs] = await Promise.all([
    db
      .select()
      .from(bankIntegrations)
      .where(
        and(
          eq(bankIntegrations.userId, userId),
          eq(bankIntegrations.provider, "bca")
        )
      )
      .limit(1),
    db
      .select()
      .from(bankSyncLogs)
      .where(eq(bankSyncLogs.userId, userId))
      .orderBy(desc(bankSyncLogs.createdAt))
      .limit(25),
  ]);

  const walletIdSet = new Set<string>(rawLogs.map((l) => l.walletId));
  if (row) {
    walletIdSet.add(row.walletId);
  }
  const walletIds = Array.from(walletIdSet);

  const walletNameMap = new Map<string, string>();
  if (walletIds.length > 0) {
    const ws = await db
      .select({ id: wallets.id, name: wallets.name })
      .from(wallets)
      .where(inArray(wallets.id, walletIds));
    for (const w of ws) {
      walletNameMap.set(w.id, w.name);
    }
  }

  const integration: BcaIntegrationView | null = row
    ? toIntegrationView(row, walletNameMap.get(row.walletId) ?? "Dompet BCA")
    : null;

  const logs: BcaSyncLogView[] = rawLogs.map((l) => ({
    id: l.id,
    walletId: l.walletId,
    walletName: walletNameMap.get(l.walletId) ?? "Dompet BCA",
    source: l.source,
    transactionId: l.transactionId,
    status: l.status,
    rawSnippet: l.rawSnippet,
    errorMessage: l.errorMessage,
    createdAt: l.createdAt,
  }));

  return { integration, logs };
}

export async function upsertBcaIntegration(
  db: AppDb,
  userId: string,
  input: {
    walletId: string;
    isActive?: boolean;
    autoCategorize?: boolean;
    providerWalletMap?: Record<string, string>;
  }
): Promise<{ integration: BcaIntegrationView; rawToken: string | null }> {
  const membership = await assertWalletAccess(
    db,
    input.walletId,
    userId,
    "editor"
  );
  if (membership.wallet.archivedAt) {
    throw new AppError(
      400,
      "Dompet yang diarsipkan tidak dapat dijadikan target integrasi otomatis."
    );
  }

  let sanitizedMap: Record<string, string> | undefined;
  if (input.providerWalletMap !== undefined) {
    sanitizedMap = {};
    for (const [providerKey, targetId] of Object.entries(
      input.providerWalletMap
    )) {
      const cleanKey = providerKey.trim().toLowerCase();
      const cleanWalletId = typeof targetId === "string" ? targetId.trim() : "";
      if (!cleanKey || !cleanWalletId) continue;
      const targetMem = await assertWalletAccess(
        db,
        cleanWalletId,
        userId,
        "editor"
      );
      if (!targetMem.wallet.archivedAt) {
        sanitizedMap[cleanKey] = cleanWalletId;
      }
    }
  }

  const now = new Date().toISOString();
  const [existing] = await db
    .select()
    .from(bankIntegrations)
    .where(
      and(
        eq(bankIntegrations.userId, userId),
        eq(bankIntegrations.provider, "bca")
      )
    )
    .limit(1);

  if (existing) {
    const nextIsActive = input.isActive ?? existing.isActive;
    const nextAutoCat = input.autoCategorize ?? existing.autoCategorize;
    const nextMapJson =
      sanitizedMap !== undefined
        ? JSON.stringify(sanitizedMap)
        : existing.providerWalletMap;
    const [updated] = await db
      .update(bankIntegrations)
      .set({
        walletId: input.walletId,
        isActive: nextIsActive,
        autoCategorize: nextAutoCat,
        providerWalletMap: nextMapJson,
        updatedAt: now,
      })
      .where(eq(bankIntegrations.id, existing.id))
      .returning();

    return {
      integration: toIntegrationView(updated!, membership.wallet.name),
      rawToken: null,
    };
  }

  const generated = generateWebhookToken();
  const id = crypto.randomUUID();
  const [created] = await db
    .insert(bankIntegrations)
    .values({
      id,
      userId,
      provider: "bca",
      walletId: input.walletId,
      webhookTokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      isActive: input.isActive ?? true,
      autoCategorize: input.autoCategorize ?? true,
      providerWalletMap: JSON.stringify(sanitizedMap ?? {}),
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    integration: toIntegrationView(created!, membership.wallet.name),
    rawToken: generated.rawToken,
  };
}

export async function rotateBcaWebhookToken(
  db: AppDb,
  userId: string
): Promise<{ integration: BcaIntegrationView; rawToken: string }> {
  const [existing] = await db
    .select()
    .from(bankIntegrations)
    .where(
      and(
        eq(bankIntegrations.userId, userId),
        eq(bankIntegrations.provider, "bca")
      )
    )
    .limit(1);

  if (!existing) {
    throw new AppError(
      404,
      "Integrasi BCA belum diaktifkan. Pilih dompet tujuan terlebih dahulu."
    );
  }

  const generated = generateWebhookToken();
  const now = new Date().toISOString();

  const [updated] = await db
    .update(bankIntegrations)
    .set({
      webhookTokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      updatedAt: now,
    })
    .where(eq(bankIntegrations.id, existing.id))
    .returning();

  const [w] = await db
    .select({ name: wallets.name })
    .from(wallets)
    .where(eq(wallets.id, updated!.walletId))
    .limit(1);

  return {
    integration: toIntegrationView(updated!, w?.name ?? "Dompet BCA"),
    rawToken: generated.rawToken,
  };
}

const REALTIME_DEDUPE_WINDOW_MS = 3 * 60 * 1000;

const COUNTERPARTY_STOP_WORDS = new Set([
  "pt",
  "cv",
  "tbk",
  "ud",
  "di",
  "ke",
  "dari",
  "via",
  "qris",
  "bca",
  "bri",
  "bni",
  "mandiri",
  "bsi",
  "id",
  "indonesia",
  "merchant",
  "pembayaran",
  "transfer",
  "transaksi",
  "keluar",
  "masuk",
  "dana",
  "virtual",
  "account",
]);

function detectNotificationOriginApp(
  rawText: string,
  source: "webhook_email" | "webhook_push" | "csv_import" | "simulator"
): string | null {
  if (source === "webhook_email") {
    return "email";
  }
  const lower = rawText.toLowerCase();
  if (/\bmybca\b/.test(lower)) return "mybca";
  if (/\b(?:bca\s*mobile|m-?bca|mbca)\b/.test(lower)) return "bca_mobile";
  if (/\b(?:blu\s*by\s*bca|blubca)\b/.test(lower)) return "blu";
  if (/\blivin\b/.test(lower)) return "livin";
  if (/\bwondr\b/.test(lower)) return "wondr";
  if (/\bbni\s*mobile\b/.test(lower)) return "bni_mobile";
  if (/\bbyond\b/.test(lower)) return "byond";
  if (/\bbsi\s*mobile\b/.test(lower)) return "bsi_mobile";
  if (/\bbrimo\b/.test(lower)) return "brimo";
  if (/\bemail\s+notifikasi\b/.test(lower)) return "email";
  if (/\bsms\s+notifikasi\b/.test(lower)) return "sms";
  if (/\bwhatsapp\b/.test(lower)) return "whatsapp";
  return null;
}

function extractComparableCounterparty(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Generic titles without an extracted merchant/counterparty name
  if (
    /^(?:dana\s+masuk|pembayaran\s+qris|pembayaran\s+virtual\s+account|tarik\s+tunai\s*\/\s*debit|pembayaran\s+(?:gopay|shopeepay|ovo|dana)|transaksi\s+keluar)\b/i.test(
      trimmed
    )
  ) {
    return null;
  }

  const stripped = trimmed
    .replace(
      /^(?:transfer\s+masuk|qris|va|atm\/debit|gopay|shopeepay|ovo|dana)\s*[·:\-]\s*/i,
      ""
    )
    .replace(/^transfer\s+ke\s+/i, "")
    .trim();

  return stripped.length >= 2 ? stripped : null;
}

function tokenizeCounterparty(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !COUNTERPARTY_STOP_WORDS.has(tok));
}

function areCounterpartiesConflicting(
  a: string | null,
  b: string | null
): boolean {
  if (!a || !b) return false;
  const normA = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normB = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normA || !normB) return false;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) {
    return false;
  }
  const tokensA = tokenizeCounterparty(a);
  const tokensB = tokenizeCounterparty(b);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return false;
  }
  const setB = new Set(tokensB);
  const hasOverlap = tokensA.some((t) => setB.has(t));
  return !hasOverlap;
}

function isRealtimeCrossAppDuplicate(
  incoming: {
    source: "webhook_email" | "webhook_push";
    rawSnippet: string;
    referenceCode: string | null;
    counterparty: string | null;
  },
  existing: {
    source: "webhook_email" | "webhook_push" | "csv_import" | "simulator";
    rawSnippet: string;
    title: string;
  }
): boolean {
  const existingRef = extractTransactionReference(existing.rawSnippet);
  if (incoming.referenceCode && existingRef) {
    // Same bank reference -> guaranteed duplicate; different bank references -> guaranteed distinct transactions
    return incoming.referenceCode === existingRef;
  }

  const incomingOrigin = detectNotificationOriginApp(
    incoming.rawSnippet,
    incoming.source
  );
  const existingOrigin = detectNotificationOriginApp(
    existing.rawSnippet,
    existing.source
  );
  const isDifferentChannelOrSiblingApp =
    incoming.source !== existing.source ||
    (incomingOrigin !== null &&
      existingOrigin !== null &&
      incomingOrigin !== existingOrigin);

  // Two sibling apps (e.g. myBCA + BCA mobile) or Push + Email reporting the exact
  // same wallet + amount + type + date within 3 minutes without conflicting Ref codes
  if (isDifferentChannelOrSiblingApp) {
    return true;
  }

  // Same app within 3 minutes: deduplicate unless both explicitly name two unrelated counterparties
  const existingCounterparty = extractComparableCounterparty(existing.title);
  return !areCounterpartiesConflicting(
    incoming.counterparty,
    existingCounterparty
  );
}

function isDedupeUniqueError(err: unknown): boolean {
  return (
    isPgUniqueViolation(err, "idx_bank_sync_dedupe") ||
    isPgUniqueViolation(err, "bank_sync_logs")
  );
}

async function recordParsedEntryForWallet(
  db: AppDb,
  params: {
    userId: string;
    integrationId: string | null;
    walletId: string;
    autoCategorize: boolean;
    source: "webhook_email" | "webhook_push" | "csv_import" | "simulator";
    entry: ParsedBcaEntry;
    rawSnippet: string;
    overrideCategoryId?: string;
  }
): Promise<
  | { status: "imported"; transaction: TransactionView }
  | { status: "duplicate"; message: string }
> {
  const membership = await assertWalletAccess(
    db,
    params.walletId,
    params.userId,
    "editor"
  );
  const ownerCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
    })
    .from(categories)
    .where(eq(categories.userId, membership.wallet.ownerId));

  let categoryId = params.overrideCategoryId;
  if (!categoryId) {
    if (params.autoCategorize) {
      categoryId = suggestBcaCategoryId(
        ownerCategories,
        params.entry.type,
        `${params.entry.title} ${params.entry.notes}`
      );
    } else {
      const sameType = ownerCategories.filter(
        (c) => c.type === params.entry.type
      );
      if (sameType.length === 0) {
        throw new AppError(
          400,
          "Tidak ada kategori yang sesuai pada dompet tujuan."
        );
      }
      categoryId =
        sameType.find((c) => c.name.toLowerCase().includes("lain"))?.id ??
        sameType[0].id;
    }
  }

  const dedupeHash = buildBcaDedupeHash(params.walletId, params.entry);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const snippet = params.rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);
  const isRealtimeWebhook =
    params.source === "webhook_push" || params.source === "webhook_email";

  return db.transaction(async (tx) => {
    // Serialize concurrent webhook deliveries for the same wallet (e.g., myBCA + BCA mobile firing simultaneously)
    if (isRealtimeWebhook) {
      await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.id, params.walletId))
        .for("update");
    }

    const [existingDup] = await tx
      .select({ id: bankSyncLogs.id })
      .from(bankSyncLogs)
      .where(
        and(
          eq(bankSyncLogs.walletId, params.walletId),
          eq(bankSyncLogs.dedupeHash, dedupeHash),
          eq(bankSyncLogs.status, "imported")
        )
      )
      .limit(1);

    if (existingDup) {
      await tx.insert(bankSyncLogs).values({
        id: crypto.randomUUID(),
        userId: params.userId,
        integrationId: params.integrationId,
        walletId: params.walletId,
        source: params.source,
        dedupeHash,
        transactionId: null,
        status: "duplicate",
        rawSnippet: snippet,
        errorMessage: "Transaksi serupa sudah pernah tercatat (anti-duplikat).",
        createdAt: now,
      });
      return {
        status: "duplicate" as const,
        message: "Transaksi serupa sudah pernah tercatat sebelumnya.",
      };
    }

    // Cross-app & cross-channel semantic deduplication for real-time webhooks
    // Prevents double-recording when e.g. myBCA + BCA mobile (or Push + Email) both alert for one transaction
    if (isRealtimeWebhook) {
      const cutoffIso = new Date(
        nowDate.getTime() - REALTIME_DEDUPE_WINDOW_MS
      ).toISOString();
      const recentCandidates = await tx
        .select({
          logId: bankSyncLogs.id,
          source: bankSyncLogs.source,
          rawSnippet: bankSyncLogs.rawSnippet,
          txTitle: transactions.title,
        })
        .from(bankSyncLogs)
        .innerJoin(transactions, eq(transactions.id, bankSyncLogs.transactionId))
        .where(
          and(
            eq(bankSyncLogs.walletId, params.walletId),
            eq(bankSyncLogs.status, "imported"),
            inArray(bankSyncLogs.source, ["webhook_push", "webhook_email"]),
            gte(bankSyncLogs.createdAt, cutoffIso),
            eq(transactions.type, params.entry.type),
            eq(transactions.amount, params.entry.amount),
            eq(transactions.occurredAt, params.entry.occurredAt)
          )
        )
        .orderBy(desc(bankSyncLogs.createdAt))
        .limit(5);

      const incomingRef =
        params.entry.referenceCode ??
        extractTransactionReference(params.rawSnippet);
      const incomingCounterparty =
        params.entry.counterparty ??
        extractComparableCounterparty(params.entry.title);

      const matchedRecent = recentCandidates.find((candidate) =>
        isRealtimeCrossAppDuplicate(
          {
            source: params.source as "webhook_email" | "webhook_push",
            rawSnippet: params.rawSnippet,
            referenceCode: incomingRef,
            counterparty: incomingCounterparty,
          },
          {
            source: candidate.source,
            rawSnippet: candidate.rawSnippet,
            title: candidate.txTitle,
          }
        )
      );

      if (matchedRecent) {
        const formattedAmt = params.entry.amount.toLocaleString("id-ID");
        await tx.insert(bankSyncLogs).values({
          id: crypto.randomUUID(),
          userId: params.userId,
          integrationId: params.integrationId,
          walletId: params.walletId,
          source: params.source,
          dedupeHash,
          transactionId: null,
          status: "duplicate",
          rawSnippet: snippet,
          errorMessage: `Duplikat lintas-aplikasi/notifikasi dilewati (transaksi Rp ${formattedAmt} baru saja tercatat).`,
          createdAt: now,
        });
        return {
          status: "duplicate" as const,
          message: `Notifikasi duplikat lintas-aplikasi dilewati (transaksi Rp ${formattedAmt} sudah tercatat).`,
        };
      }
    }

    const createdTx = await insertTransactionInExecutor(
      tx as unknown as AppDb,
      params.userId,
      {
        walletId: params.walletId,
        categoryId,
        type: params.entry.type,
        amount: params.entry.amount,
        title: params.entry.title,
        notes: params.entry.notes,
        paymentMethod: params.entry.paymentMethod,
        occurredAt: params.entry.occurredAt,
      }
    );

    try {
      await tx.insert(bankSyncLogs).values({
        id: crypto.randomUUID(),
        userId: params.userId,
        integrationId: params.integrationId,
        walletId: params.walletId,
        source: params.source,
        dedupeHash,
        transactionId: createdTx.id,
        status: "imported",
        rawSnippet: snippet,
        errorMessage: null,
        createdAt: now,
      });
    } catch (err) {
      if (isDedupeUniqueError(err)) {
        throw new AppError(409, "Transaksi serupa sedang diproses.");
      }
      throw err;
    }

    if (params.integrationId) {
      await tx
        .update(bankIntegrations)
        .set({ lastSyncedAt: now, updatedAt: now })
        .where(eq(bankIntegrations.id, params.integrationId));
    }

    return { status: "imported" as const, transaction: createdTx };
  });
}

/**
 * Ingests a real-time BCA email/push notification authenticated via the user's
 * per-integration webhook secret token.
 */
export async function ingestBcaNotificationByToken(
  db: AppDb,
  rawToken: string,
  payload: {
    text: string;
    subject?: string;
    source?: "webhook_email" | "webhook_push";
    occurredAt?: string;
    externalId?: string;
  }
): Promise<
  | { status: "imported"; transaction: TransactionView }
  | { status: "duplicate"; message: string }
> {
  const trimmedToken = rawToken.trim();
  if (!trimmedToken) {
    throw new AppError(401, "Token webhook BCA tidak ditemukan.");
  }

  const tokenHash = hashWebhookToken(trimmedToken);
  const [integration] = await db
    .select()
    .from(bankIntegrations)
    .where(eq(bankIntegrations.webhookTokenHash, tokenHash))
    .limit(1);

  if (!integration) {
    throw new AppError(401, "Token webhook BCA tidak valid.");
  }
  if (!integration.isActive) {
    throw new AppError(403, "Integrasi otomatis BCA sedang dinonaktifkan.");
  }

  const fallbackDate = payload.occurredAt
    ? assertValidIsoDate(payload.occurredAt)
    : undefined;

  const parsed = parseBcaNotification(payload.text, {
    subject: payload.subject,
    fallbackDate,
    externalId: payload.externalId,
  });

  const source = payload.source ?? "webhook_email";
  const snippet = [payload.subject, payload.text]
    .filter(Boolean)
    .join(" — ")
    .replace(/\s+/g, " ")
    .slice(0, 220);

  if (!parsed) {
    const isUnexpandedMacroDroidToken =
      /\[(?:not_body|notification|not_title)\]/i.test(payload.text);
    const failMessage = isUnexpandedMacroDroidToken
      ? "MacroDroid mengirim variabel mentah ([not_body]/[notification]). Ganti dengan [notification] lewat tombol Magic Text (...) dan pastikan makro dipicu oleh Notification Received."
      : "Format notifikasi bank/e-wallet tidak dikenali (nominal atau arah masuk/keluar tidak ditemukan).";

    await db.insert(bankSyncLogs).values({
      id: crypto.randomUUID(),
      userId: integration.userId,
      integrationId: integration.id,
      walletId: integration.walletId,
      source,
      dedupeHash: crypto.randomUUID(),
      transactionId: null,
      status: "failed",
      rawSnippet: snippet || "(pesan kosong)",
      errorMessage: failMessage,
      createdAt: new Date().toISOString(),
    });

    throw new AppError(
      422,
      isUnexpandedMacroDroidToken
        ? failMessage
        : "Format notifikasi bank/e-wallet tidak dikenali. Pastikan berisi nominal (Rp/IDR) dan keterangan uang masuk atau keluar."
    );
  }

  const providerMap = parseProviderWalletMap(integration.providerWalletMap);
  const routedWalletId =
    (parsed.providerId && providerMap[parsed.providerId]) ||
    integration.walletId;

  return recordParsedEntryForWallet(db, {
    userId: integration.userId,
    integrationId: integration.id,
    walletId: routedWalletId,
    autoCategorize: integration.autoCategorize,
    source,
    entry: parsed,
    rawSnippet: snippet,
  });
}

/**
 * Authenticated UI simulator: preview or immediately record a pasted BCA notification.
 */
export async function simulateBcaNotification(
  db: AppDb,
  userId: string,
  input: {
    text: string;
    subject?: string;
    walletId?: string;
    commit?: boolean;
  }
): Promise<{
  parsed: ParsedBcaEntry;
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  result?:
    | { status: "imported"; transaction: TransactionView }
    | { status: "duplicate"; message: string };
}> {
  const [integration] = await db
    .select()
    .from(bankIntegrations)
    .where(
      and(
        eq(bankIntegrations.userId, userId),
        eq(bankIntegrations.provider, "bca")
      )
    )
    .limit(1);

  const targetWalletId = input.walletId ?? integration?.walletId;
  if (!targetWalletId) {
    throw new AppError(
      400,
      "Pilih dompet BCA tujuan terlebih dahulu sebelum menguji notifikasi."
    );
  }

  const parsed = parseBcaNotification(input.text, { subject: input.subject });
  if (!parsed) {
    throw new AppError(
      422,
      "Teks notifikasi bank/e-wallet tidak dapat dibaca. Pastikan terdapat nominal Rupiah dan kata kunci seperti Transfer Masuk, QRIS, Virtual Account, atau Bayar."
    );
  }

  const providerMap = parseProviderWalletMap(integration?.providerWalletMap);
  const mappedWalletId =
    (parsed.providerId && providerMap[parsed.providerId]) || undefined;
  const effectiveWalletId = mappedWalletId ?? targetWalletId;

  const membership = await assertWalletAccess(
    db,
    effectiveWalletId,
    userId,
    "editor"
  );

  const ownerCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
    })
    .from(categories)
    .where(eq(categories.userId, membership.wallet.ownerId));

  const suggestedCategoryId = suggestBcaCategoryId(
    ownerCategories,
    parsed.type,
    `${parsed.title} ${parsed.notes}`
  );
  const suggestedCategoryName =
    ownerCategories.find((c) => c.id === suggestedCategoryId)?.name ??
    "Lainnya";

  if (!input.commit) {
    return { parsed, suggestedCategoryId, suggestedCategoryName };
  }

  const result = await recordParsedEntryForWallet(db, {
    userId,
    integrationId: integration?.id ?? null,
    walletId: effectiveWalletId,
    autoCategorize: integration?.autoCategorize ?? true,
    source: "simulator",
    entry: parsed,
    rawSnippet: [input.subject, input.text].filter(Boolean).join(" — "),
    overrideCategoryId: suggestedCategoryId,
  });

  return { parsed, suggestedCategoryId, suggestedCategoryName, result };
}

/**
 * Parses a KlikBCA / myBCA CSV mutasi file and flags rows that already exist in DB.
 */
export async function previewBcaCsvImport(
  db: AppDb,
  userId: string,
  input: { walletId: string; csvText: string }
): Promise<{
  rows: BcaCsvPreviewRow[];
  skippedPending: number;
  skippedInvalid: number;
  detectedPeriod: string | null;
  categories: Array<{ id: string; name: string; type: "income" | "expense" }>;
}> {
  const membership = await assertWalletAccess(
    db,
    input.walletId,
    userId,
    "editor"
  );
  const parsed = parseBcaCsv(input.csvText);

  if (parsed.entries.length === 0) {
    throw new AppError(
      422,
      "Tidak ada baris transaksi valid yang ditemukan di file CSV BCA. Pastikan kolom Tanggal, Keterangan, dan Jumlah (CR/DB) tersedia."
    );
  }

  const hashes = parsed.entries.map((e) =>
    buildBcaDedupeHash(input.walletId, e)
  );

  const [ownerCategories, existingRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
      })
      .from(categories)
      .where(eq(categories.userId, membership.wallet.ownerId)),
    hashes.length > 0
      ? db
          .select({ dedupeHash: bankSyncLogs.dedupeHash })
          .from(bankSyncLogs)
          .where(
            and(
              eq(bankSyncLogs.walletId, input.walletId),
              eq(bankSyncLogs.status, "imported"),
              inArray(bankSyncLogs.dedupeHash, hashes)
            )
          )
      : Promise.resolve([]),
  ]);

  const catNameMap = new Map(ownerCategories.map((c) => [c.id, c.name]));
  const existingSet = new Set(existingRows.map((r) => r.dedupeHash));

  const seenInBatch = new Set<string>();
  const rows: BcaCsvPreviewRow[] = parsed.entries.map((entry, idx) => {
    const dedupeHash = hashes[idx];
    const isDuplicate =
      existingSet.has(dedupeHash) || seenInBatch.has(dedupeHash);
    seenInBatch.add(dedupeHash);

    const suggestedCategoryId = suggestBcaCategoryId(
      ownerCategories,
      entry.type,
      `${entry.title} ${entry.notes}`
    );

    return {
      ...entry,
      dedupeHash,
      suggestedCategoryId,
      suggestedCategoryName: catNameMap.get(suggestedCategoryId) ?? "Lainnya",
      isDuplicate,
    };
  });

  return {
    rows,
    skippedPending: parsed.skippedPending,
    skippedInvalid: parsed.skippedInvalid,
    detectedPeriod: parsed.detectedPeriod,
    categories: ownerCategories,
  };
}

/**
 * Commits selected BCA CSV mutasi rows atomically with per-row deduplication.
 */
export async function commitBcaCsvImport(
  db: AppDb,
  userId: string,
  input: {
    walletId: string;
    rows: Array<{
      type: "income" | "expense";
      amount: number;
      title: string;
      occurredAt: string;
      paymentMethod: string;
      notes: string;
      dedupeKey: string;
      categoryId: string;
    }>;
  }
): Promise<{
  importedCount: number;
  duplicateCount: number;
  totalIncome: number;
  totalExpense: number;
}> {
  await assertWalletAccess(db, input.walletId, userId, "editor");
  if (input.rows.length === 0) {
    throw new AppError(400, "Pilih minimal satu transaksi untuk diimpor.");
  }

  const [integration] = await db
    .select({ id: bankIntegrations.id })
    .from(bankIntegrations)
    .where(
      and(
        eq(bankIntegrations.userId, userId),
        eq(bankIntegrations.provider, "bca")
      )
    )
    .limit(1);

  let importedCount = 0;
  let duplicateCount = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of input.rows) {
    const res = await recordParsedEntryForWallet(db, {
      userId,
      integrationId: integration?.id ?? null,
      walletId: input.walletId,
      autoCategorize: true,
      source: "csv_import",
      entry: {
        type: row.type,
        amount: row.amount,
        title: row.title,
        occurredAt: assertValidIsoDate(row.occurredAt),
        paymentMethod: row.paymentMethod,
        notes: row.notes,
        dedupeKey: row.dedupeKey,
      },
      rawSnippet: `${row.occurredAt} | ${row.title} | ${row.amount}`,
      overrideCategoryId: row.categoryId,
    });

    if (res.status === "imported") {
      importedCount++;
      if (row.type === "income") totalIncome += row.amount;
      else totalExpense += row.amount;
    } else {
      duplicateCount++;
    }
  }

  return { importedCount, duplicateCount, totalIncome, totalExpense };
}
