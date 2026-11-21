import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db";
import { users, walletInvites, walletMembers, wallets } from "@/db/schema";
import type { SafeUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export type WalletRole = "owner" | "editor" | "viewer";
export type WalletType = "cash" | "bank" | "ewallet" | "savings";

export type WalletMembership = {
  wallet: typeof wallets.$inferSelect;
  role: WalletRole;
};

export type WalletMemberView = {
  userId: string;
  name: string;
  email: string;
  role: WalletRole;
  createdAt: string;
};

export type WalletWithRole = {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  type: WalletType;
  initialBalance: number;
  balance: number;
  isShared: boolean;
  archivedAt: string | null;
  createdAt: string;
  role: WalletRole;
  members: WalletMemberView[];
};

export type InviteRecord = {
  id: string;
  walletId: string;
  walletName: string;
  email: string | null;
  role: "editor" | "viewer";
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type PendingInviteView = {
  id: string;
  walletId: string;
  walletName: string;
  inviterName: string;
  email: string | null;
  role: "editor" | "viewer";
  token: string;
  expiresAt: string;
  createdAt: string;
};

const ROLE_RANK: Record<WalletRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hydrates wallet records with their member lists using a single batch query.
 */
function buildWalletViews(
  db: AppDb,
  rows: Array<{
    wallet: typeof wallets.$inferSelect;
    role: WalletRole;
    ownerName: string;
  }>
): WalletWithRole[] {
  if (rows.length === 0) {
    return [];
  }

  const walletIds = rows.map((row) => row.wallet.id);
  const memberRows = db
    .select({
      walletId: walletMembers.walletId,
      userId: walletMembers.userId,
      role: walletMembers.role,
      createdAt: walletMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(walletMembers)
    .innerJoin(users, eq(walletMembers.userId, users.id))
    .where(inArray(walletMembers.walletId, walletIds))
    .orderBy(asc(walletMembers.createdAt))
    .all();

  const membersByWallet = new Map<string, WalletMemberView[]>();
  for (const row of memberRows) {
    const list = membersByWallet.get(row.walletId) ?? [];
    list.push({
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
    });
    membersByWallet.set(row.walletId, list);
  }

  return rows.map(({ wallet, role, ownerName }) => ({
    id: wallet.id,
    ownerId: wallet.ownerId,
    ownerName,
    name: wallet.name,
    type: wallet.type,
    initialBalance: wallet.initialBalance,
    balance: wallet.balance,
    isShared: wallet.isShared,
    archivedAt: wallet.archivedAt,
    createdAt: wallet.createdAt,
    role,
    members: membersByWallet.get(wallet.id) ?? [],
  }));
}

function getWalletViewForUser(
  db: AppDb,
  walletId: string,
  userId: string,
  role: WalletRole
): WalletWithRole {
  const row = db
    .select({
      wallet: wallets,
      ownerName: users.name,
    })
    .from(wallets)
    .innerJoin(users, eq(wallets.ownerId, users.id))
    .where(eq(wallets.id, walletId))
    .get();

  if (!row) {
    throw new AppError(404, "Dompet tidak ditemukan.");
  }

  return buildWalletViews(db, [
    { wallet: row.wallet, role, ownerName: row.ownerName },
  ])[0];
}

/**
 * Verifies that a wallet exists and the user holds at least `minRole` access.
 */
export function assertWalletAccess(
  db: AppDb,
  walletId: string,
  userId: string,
  minRole: WalletRole
): WalletMembership {
  const wallet = db
    .select()
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .get();

  if (!wallet) {
    throw new AppError(404, "Dompet tidak ditemukan.");
  }

  const membership = db
    .select({ role: walletMembers.role })
    .from(walletMembers)
    .where(
      and(
        eq(walletMembers.walletId, walletId),
        eq(walletMembers.userId, userId)
      )
    )
    .get();

  if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AppError(403, "Anda tidak memiliki akses ke dompet ini.");
  }

  return { wallet, role: membership.role };
}

/**
 * Lists all wallets accessible to the user, optionally including archived ones.
 */
export function listUserWallets(
  db: AppDb,
  userId: string,
  opts?: { includeArchived?: boolean }
): WalletWithRole[] {
  const condition = opts?.includeArchived
    ? eq(walletMembers.userId, userId)
    : and(eq(walletMembers.userId, userId), isNull(wallets.archivedAt));

  const rows = db
    .select({
      wallet: wallets,
      role: walletMembers.role,
      ownerName: users.name,
    })
    .from(walletMembers)
    .innerJoin(wallets, eq(walletMembers.walletId, wallets.id))
    .innerJoin(users, eq(wallets.ownerId, users.id))
    .where(condition)
    .orderBy(asc(wallets.createdAt))
    .all();

  return buildWalletViews(db, rows);
}

/**
 * Creates a new wallet and its owner membership atomically.
 */
export function createWallet(
  db: AppDb,
  userId: string,
  input: { name: string; type: WalletType; initialBalance: number }
): WalletWithRole {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "Nama dompet wajib diisi.");
  }

  if (
    !Number.isFinite(input.initialBalance) ||
    !Number.isInteger(input.initialBalance) ||
    input.initialBalance < 0
  ) {
    throw new AppError(
      400,
      "Saldo awal harus berupa bilangan bulat minimal 0."
    );
  }

  const owner = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!owner) {
    throw new AppError(404, "Pengguna tidak ditemukan.");
  }

  const walletId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(wallets)
      .values({
        id: walletId,
        ownerId: userId,
        name,
        type: input.type,
        initialBalance: input.initialBalance,
        balance: input.initialBalance,
        isShared: false,
        archivedAt: null,
        createdAt: now,
      })
      .run();

    tx.insert(walletMembers)
      .values({
        id: crypto.randomUUID(),
        walletId,
        userId,
        role: "owner",
        createdAt: now,
      })
      .run();
  });

  return getWalletViewForUser(db, walletId, userId, "owner");
}

/**
 * Updates wallet name, type, or archive status (owner only).
 */
export function updateWallet(
  db: AppDb,
  walletId: string,
  userId: string,
  input: { name?: string; type?: WalletType; archived?: boolean }
): WalletWithRole {
  assertWalletAccess(db, walletId, userId, "owner");

  const patch: Partial<typeof wallets.$inferInsert> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new AppError(400, "Nama dompet tidak boleh kosong.");
    }
    patch.name = trimmed;
  }

  if (input.type !== undefined) {
    patch.type = input.type;
  }

  if (input.archived !== undefined) {
    patch.archivedAt = input.archived ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length > 0) {
    db.update(wallets).set(patch).where(eq(wallets.id, walletId)).run();
  }

  return getWalletViewForUser(db, walletId, userId, "owner");
}

/**
 * Creates a single-use 7-day invitation token for a wallet (owner only).
 */
export function createWalletInvite(
  db: AppDb,
  walletId: string,
  ownerId: string,
  input: { email?: string | null; role: "editor" | "viewer" }
): InviteRecord {
  const { wallet } = assertWalletAccess(db, walletId, ownerId, "owner");

  const owner = db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ownerId))
    .get();

  const normalizedEmail = input.email?.trim()
    ? input.email.trim().toLowerCase()
    : null;

  if (normalizedEmail) {
    if (owner && normalizedEmail === owner.email.toLowerCase()) {
      throw new AppError(400, "Anda tidak dapat mengundang diri sendiri.");
    }

    const existingUser = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .get();

    if (existingUser) {
      const existingMember = db
        .select({ id: walletMembers.id })
        .from(walletMembers)
        .where(
          and(
            eq(walletMembers.walletId, walletId),
            eq(walletMembers.userId, existingUser.id)
          )
        )
        .get();

      if (existingMember) {
        throw new AppError(409, "Pengguna ini sudah menjadi anggota dompet.");
      }
    }
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const id = crypto.randomUUID();
  const token = randomBytes(32).toString("hex");

  db.insert(walletInvites)
    .values({
      id,
      walletId,
      createdBy: ownerId,
      email: normalizedEmail,
      role: input.role,
      token,
      expiresAt,
      acceptedAt: null,
      createdAt,
    })
    .run();

  return {
    id,
    walletId,
    walletName: wallet.name,
    email: normalizedEmail,
    role: input.role,
    token,
    expiresAt,
    acceptedAt: null,
    createdAt,
  };
}

function validateAndGetInviteRow(
  db: AppDb,
  token: string
): PendingInviteView {
  if (!token) {
    throw new AppError(404, "Tautan undangan tidak ditemukan.");
  }

  const row = db
    .select({
      id: walletInvites.id,
      walletId: walletInvites.walletId,
      walletName: wallets.name,
      inviterName: users.name,
      email: walletInvites.email,
      role: walletInvites.role,
      token: walletInvites.token,
      expiresAt: walletInvites.expiresAt,
      acceptedAt: walletInvites.acceptedAt,
      createdAt: walletInvites.createdAt,
    })
    .from(walletInvites)
    .innerJoin(wallets, eq(walletInvites.walletId, wallets.id))
    .innerJoin(users, eq(walletInvites.createdBy, users.id))
    .where(eq(walletInvites.token, token))
    .get();

  if (!row) {
    throw new AppError(404, "Tautan undangan tidak ditemukan.");
  }

  if (row.acceptedAt != null) {
    throw new AppError(410, "Tautan undangan sudah digunakan.");
  }

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    throw new AppError(410, "Tautan undangan telah kedaluwarsa.");
  }

  return {
    id: row.id,
    walletId: row.walletId,
    walletName: row.walletName,
    inviterName: row.inviterName,
    email: row.email,
    role: row.role,
    token: row.token,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/**
 * Validates and returns a pending invite preview by token (404/410 on invalid state).
 */
export function getInviteByToken(db: AppDb, token: string): PendingInviteView {
  return validateAndGetInviteRow(db, token);
}

/**
 * Accepts a single-use wallet invitation atomically and marks the wallet shared.
 */
export function acceptWalletInvite(
  db: AppDb,
  token: string,
  user: SafeUser
): { walletId: string; walletName: string; role: "editor" | "viewer" } {
  const invite = validateAndGetInviteRow(db, token);

  if (invite.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError(
      403,
      "Undangan ini ditujukan untuk alamat email yang berbeda."
    );
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    // Atomically claim the single-use invite inside the transaction.
    const claimed = tx
      .update(walletInvites)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(walletInvites.id, invite.id),
          isNull(walletInvites.acceptedAt)
        )
      )
      .returning({
        id: walletInvites.id,
        expiresAt: walletInvites.expiresAt,
      })
      .get();

    if (!claimed) {
      throw new AppError(410, "Tautan undangan sudah digunakan.");
    }

    const freshExpiresMs = Date.parse(claimed.expiresAt);
    if (Number.isNaN(freshExpiresMs) || freshExpiresMs <= Date.now()) {
      throw new AppError(410, "Tautan undangan telah kedaluwarsa.");
    }

    const existingMember = tx
      .select({ id: walletMembers.id })
      .from(walletMembers)
      .where(
        and(
          eq(walletMembers.walletId, invite.walletId),
          eq(walletMembers.userId, user.id)
        )
      )
      .get();

    if (existingMember) {
      throw new AppError(409, "Anda sudah menjadi anggota dompet ini.");
    }

    tx.insert(walletMembers)
      .values({
        id: crypto.randomUUID(),
        walletId: invite.walletId,
        userId: user.id,
        role: invite.role,
        createdAt: now,
      })
      .run();

    tx.update(wallets)
      .set({ isShared: true })
      .where(eq(wallets.id, invite.walletId))
      .run();
  });

  return {
    walletId: invite.walletId,
    walletName: invite.walletName,
    role: invite.role,
  };
}

/**
 * Lists active, unexpired, unaccepted invitations addressed to the given email.
 */
export function listPendingInvitesForEmail(
  db: AppDb,
  email: string
): PendingInviteView[] {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const rows = db
    .select({
      id: walletInvites.id,
      walletId: walletInvites.walletId,
      walletName: wallets.name,
      inviterName: users.name,
      email: walletInvites.email,
      role: walletInvites.role,
      token: walletInvites.token,
      expiresAt: walletInvites.expiresAt,
      createdAt: walletInvites.createdAt,
    })
    .from(walletInvites)
    .innerJoin(wallets, eq(walletInvites.walletId, wallets.id))
    .innerJoin(users, eq(walletInvites.createdBy, users.id))
    .where(
      and(
        eq(walletInvites.email, normalized),
        isNull(walletInvites.acceptedAt)
      )
    )
    .orderBy(desc(walletInvites.createdAt))
    .all();

  const nowMs = Date.now();
  return rows.filter((row) => {
    const expiresMs = Date.parse(row.expiresAt);
    return !Number.isNaN(expiresMs) && expiresMs > nowMs;
  });
}

/**
 * Lists all active and past invitations for a wallet (owner only).
 */
export function listWalletInvites(
  db: AppDb,
  walletId: string,
  ownerId: string
): InviteRecord[] {
  const { wallet } = assertWalletAccess(db, walletId, ownerId, "owner");

  const rows = db
    .select()
    .from(walletInvites)
    .where(eq(walletInvites.walletId, walletId))
    .orderBy(desc(walletInvites.createdAt))
    .all();

  return rows.map((row) => ({
    id: row.id,
    walletId: row.walletId,
    walletName: wallet.name,
    email: row.email,
    role: row.role,
    token: row.token,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
  }));
}

/**
 * Removes a member from a shared wallet and resets `isShared` when only the owner remains.
 */
export function removeWalletMember(
  db: AppDb,
  walletId: string,
  ownerId: string,
  targetUserId: string
): void {
  assertWalletAccess(db, walletId, ownerId, "owner");

  if (targetUserId === ownerId) {
    throw new AppError(
      400,
      "Pemilik dompet tidak dapat menghapus dirinya sendiri."
    );
  }

  const target = db
    .select({ id: walletMembers.id })
    .from(walletMembers)
    .where(
      and(
        eq(walletMembers.walletId, walletId),
        eq(walletMembers.userId, targetUserId)
      )
    )
    .get();

  if (!target) {
    throw new AppError(404, "Anggota dompet tidak ditemukan.");
  }

  db.transaction((tx) => {
    tx.delete(walletMembers)
      .where(
        and(
          eq(walletMembers.walletId, walletId),
          eq(walletMembers.userId, targetUserId)
        )
      )
      .run();

    const remaining = tx
      .select({ id: walletMembers.id })
      .from(walletMembers)
      .where(eq(walletMembers.walletId, walletId))
      .all();

    if (remaining.length <= 1) {
      tx.update(wallets)
        .set({ isShared: false })
        .where(eq(wallets.id, walletId))
        .run();
    }
  });
}

/**
 * Masks an invitee email address for safe public invite previews.
 */
export function maskInviteEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }

  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return "***";
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const prefix = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

/**
 * Builds a Zod v3 errorMap returning natural Indonesian messages for enum fields.
 */
export function indonesianEnumErrorMap(
  requiredMessage: string,
  invalidMessage: string
): z.ZodErrorMap {
  return (issue, ctx) => {
    if (
      issue.code === z.ZodIssueCode.invalid_type &&
      issue.received === "undefined"
    ) {
      return { message: requiredMessage };
    }
    if (
      issue.code === z.ZodIssueCode.invalid_enum_value ||
      issue.code === z.ZodIssueCode.invalid_type
    ) {
      return { message: invalidMessage };
    }
    return { message: ctx.defaultError };
  };
}
