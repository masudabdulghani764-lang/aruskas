import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/db";
import {
  bankIntegrations,
  bankSyncLogs,
  categories,
  wallets,
} from "@/db/schema";
import {
  buildBcaDedupeHash,
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
  const now = new Date().toISOString();
  const snippet = params.rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);

  return db.transaction(async (tx) => {
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
      errorMessage:
        "Format notifikasi BCA tidak dikenali (nominal atau arah masuk/keluar tidak ditemukan).",
      createdAt: new Date().toISOString(),
    });

    throw new AppError(
      422,
      "Format notifikasi BCA tidak dikenali. Pastikan berisi nominal (Rp/IDR) dan keterangan uang masuk atau keluar."
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
