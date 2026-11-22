import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, type AppDb } from "@/db";
import {
  recurringRules,
  savingsGoals,
  sessions,
  transactions,
  users,
  walletInvites,
  walletMembers,
  wallets,
} from "@/db/schema";
import { AppError, isPgUniqueViolation } from "@/lib/errors";
import { seedDefaultCategoriesForUser } from "@/lib/seed";

export const DEMO_EMAIL = "demo@aruskas.id";
export const DEMO_PARTNER_EMAIL = "pasangan.demo@aruskas.id";
export const SESSION_COOKIE_NAME = "aruskas_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  monthlySavingsTarget: number;
  isDemo: boolean;
  createdAt: string;
};

/**
 * Strips sensitive fields like passwordHash from a user record.
 */
export function toSafeUser(user: {
  id: string;
  name: string;
  email: string;
  monthlySavingsTarget: number;
  createdAt: string;
}): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    monthlySavingsTarget: user.monthlySavingsTarget,
    isDemo: user.email.toLowerCase() === DEMO_EMAIL,
    createdAt: user.createdAt,
  };
}

/**
 * Hashes a plaintext password with Argon2id via Bun.password.
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

/**
 * Produces a deterministic SHA-256 hex digest of a raw session token.
 */
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a new 30-day session in the database and returns the raw token and expiry.
 */
export async function createSession(
  db: AppDb,
  userId: string,
  userAgent?: string | null
): Promise<{ token: string; expiresAt: string }> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt,
    userAgent: userAgent ?? null,
    createdAt: now.toISOString(),
  });

  return { token: rawToken, expiresAt };
}

/**
 * Resolves a raw session token to a SafeUser, deleting the session if expired.
 */
export async function getUserBySessionToken(
  db: AppDb,
  rawToken: string
): Promise<SafeUser | null> {
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        monthlySavingsTarget: users.monthlySavingsTarget,
        createdAt: users.createdAt,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, tokenHash))
    .limit(1);

  if (!row) {
    return null;
  }

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, tokenHash));
    return null;
  }

  return toSafeUser(row.user);
}

/**
 * Deletes a session by raw token if it exists.
 */
export async function destroySession(
  db: AppDb,
  rawToken: string
): Promise<void> {
  if (!rawToken) {
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  await db.delete(sessions).where(eq(sessions.id, tokenHash));
}

/**
 * Revokes all sessions belonging to a user, optionally keeping the current session token active.
 * Returns the number of revoked sessions.
 */
export async function revokeAllUserSessions(
  db: AppDb,
  userId: string,
  keepRawToken?: string | null
): Promise<number> {
  const condition = keepRawToken
    ? and(
        eq(sessions.userId, userId),
        ne(sessions.id, hashSessionToken(keepRawToken))
      )
    : eq(sessions.userId, userId);

  const deleted = await db
    .delete(sessions)
    .where(condition)
    .returning({ id: sessions.id });
  return deleted.length;
}

/**
 * Reads the Next.js session cookie and returns the authenticated user or null.
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  const db = await getDb();
  return getUserBySessionToken(db, rawToken);
}

/**
 * Requires an authenticated session, throwing AppError(401) if absent or invalid.
 */
export async function requireCurrentUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError(401, "Silakan masuk terlebih dahulu.");
  }
  return user;
}

/**
 * Parses a JSON request body and throws a 400 AppError if malformed.
 */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "Format data permintaan tidak valid.");
  }
}

/**
 * Sets the HttpOnly session cookie with appropriate security flags.
 */
export async function setSessionCookie(
  rawToken: string,
  expiresAt: string
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
}

/**
 * Clears the session cookie from the browser.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Registers a new user, provisions default wallet ("Dompet Utama") & 12 Indonesian
 * categories, and opens an authenticated session.
 */
export async function registerUser(
  db: AppDb,
  input: { name: string; email: string; password: string },
  userAgent?: string | null
): Promise<{ user: SafeUser; token: string; expiresAt: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    throw new AppError(409, "Email sudah terdaftar.");
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const defaultWalletId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        name,
        email,
        passwordHash,
        monthlySavingsTarget: 0,
        createdAt: now,
      });

      await tx.insert(wallets).values({
        id: defaultWalletId,
        ownerId: userId,
        name: "Dompet Utama",
        type: "cash",
        initialBalance: 0,
        balance: 0,
        isShared: false,
        createdAt: now,
      });

      await tx.insert(walletMembers).values({
        id: crypto.randomUUID(),
        walletId: defaultWalletId,
        userId,
        role: "owner",
        createdAt: now,
      });

      await seedDefaultCategoriesForUser(tx as unknown as AppDb, userId);
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw new AppError(409, "Email sudah terdaftar.");
    }
    throw err;
  }

  const session = await createSession(db, userId, userAgent);
  const user = toSafeUser({
    id: userId,
    name,
    email,
    monthlySavingsTarget: 0,
    createdAt: now,
  });

  return {
    user,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

/**
 * Authenticates an existing user by email and password and issues a session.
 */
export async function loginUser(
  db: AppDb,
  input: { email: string; password: string },
  userAgent?: string | null
): Promise<{ user: SafeUser; token: string; expiresAt: string }> {
  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!row) {
    throw new AppError(401, "Email atau kata sandi salah.");
  }

  const valid = await verifyPassword(input.password, row.passwordHash);
  if (!valid) {
    throw new AppError(401, "Email atau kata sandi salah.");
  }

  const session = await createSession(db, row.id, userAgent);
  return {
    user: toSafeUser(row),
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

/**
 * Updates the user's display name and monthly savings target percentage.
 */
export async function updateUserProfile(
  db: AppDb,
  userId: string,
  input: { name: string; monthlySavingsTarget: number }
): Promise<SafeUser> {
  const name = input.name.trim();
  const target = Math.round(input.monthlySavingsTarget);

  const [updated] = await db
    .update(users)
    .set({
      name,
      monthlySavingsTarget: target,
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new AppError(404, "Pengguna tidak ditemukan.");
  }

  return toSafeUser(updated);
}

/**
 * Changes the password for a non-demo user after verifying the current password
 * and revokes all other active sessions for defense-in-depth.
 */
export async function changePassword(
  db: AppDb,
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepRawToken?: string | null
): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    throw new AppError(404, "Pengguna tidak ditemukan.");
  }

  if (user.email.toLowerCase() === DEMO_EMAIL) {
    throw new AppError(403, "Akun demo tidak dapat mengubah kata sandi.");
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError(400, "Kata sandi saat ini tidak sesuai.");
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, userId));

  if (keepRawToken !== undefined) {
    await revokeAllUserSessions(db, userId, keepRawToken);
  }
}

/**
 * Finds an existing user by Google subject ID or verified email, or provisions a new
 * account with default wallet ("Dompet Utama") & 12 Indonesian categories, then opens a session.
 */
export async function findOrCreateGoogleUser(
  db: AppDb,
  profile: { sub: string; email: string; name: string },
  userAgent?: string | null
): Promise<{ user: SafeUser; token: string; expiresAt: string; isNewUser: boolean }> {
  const email = profile.email.trim().toLowerCase();
  const sub = profile.sub.trim();
  const name = profile.name.trim().slice(0, 100) || email.split("@")[0];

  // 1. Lookup by linked Google sub
  const [bySub] = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, sub))
    .limit(1);

  if (bySub) {
    const session = await createSession(db, bySub.id, userAgent);
    return {
      user: toSafeUser(bySub),
      token: session.token,
      expiresAt: session.expiresAt,
      isNewUser: false,
    };
  }

  // 2. Lookup by verified email & link Google sub
  const [byEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (byEmail) {
    if (byEmail.googleSub && byEmail.googleSub !== sub) {
      throw new AppError(
        409,
        "Email ini sudah terhubung ke akun Google lain."
      );
    }
    await db
      .update(users)
      .set({ googleSub: sub })
      .where(eq(users.id, byEmail.id));

    const session = await createSession(db, byEmail.id, userAgent);
    return {
      user: toSafeUser(byEmail),
      token: session.token,
      expiresAt: session.expiresAt,
      isNewUser: false,
    };
  }

  // 3. Provision brand-new user with unguessable random password hash + default wallet & categories
  const randomSecret = randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(randomSecret);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const defaultWalletId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      name,
      email,
      passwordHash,
      googleSub: sub,
      monthlySavingsTarget: 0,
      createdAt: now,
    });

    await tx.insert(wallets).values({
      id: defaultWalletId,
      ownerId: userId,
      name: "Dompet Utama",
      type: "cash",
      initialBalance: 0,
      balance: 0,
      isShared: false,
      createdAt: now,
    });

    await tx.insert(walletMembers).values({
      id: crypto.randomUUID(),
      walletId: defaultWalletId,
      userId,
      role: "owner",
      createdAt: now,
    });

    await seedDefaultCategoriesForUser(tx as unknown as AppDb, userId);
  });

  const session = await createSession(db, userId, userAgent);
  return {
    user: toSafeUser({
      id: userId,
      name,
      email,
      monthlySavingsTarget: 0,
      createdAt: now,
    }),
    token: session.token,
    expiresAt: session.expiresAt,
    isNewUser: true,
  };
}

/**
 * Permanently deletes a non-demo user account and all associated financial data atomically.
 * Requires exact confirmation text ("HAPUS AKUN") and password verification for password-based accounts.
 */
export async function deleteUserAccount(
  db: AppDb,
  userId: string,
  input: { confirmText: string; currentPassword?: string }
): Promise<void> {
  if (input.confirmText.trim().toUpperCase() !== "HAPUS AKUN") {
    throw new AppError(
      400,
      'Ketik "HAPUS AKUN" untuk mengonfirmasi penghapusan akun permanen.'
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError(404, "Pengguna tidak ditemukan.");
  }

  if (user.email.toLowerCase() === DEMO_EMAIL) {
    throw new AppError(403, "Akun demo tidak dapat dihapus.");
  }

  // Require password check for accounts not created via Google OAuth
  if (!user.googleSub) {
    if (!input.currentPassword) {
      throw new AppError(
        400,
        "Masukkan kata sandi saat ini untuk menghapus akun Anda."
      );
    }
    const valid = await verifyPassword(
      input.currentPassword,
      user.passwordHash
    );
    if (!valid) {
      throw new AppError(400, "Kata sandi saat ini tidak sesuai.");
    }
  }

  await db.transaction(async (tx) => {
    const ownedWallets = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.ownerId, userId));
    const ownedWalletIds = ownedWallets.map((w) => w.id);

    // Clear references to wallets owned by this user on other records
    if (ownedWalletIds.length > 0) {
      await tx
        .update(savingsGoals)
        .set({ walletId: null })
        .where(inArray(savingsGoals.walletId, ownedWalletIds));

      await tx
        .delete(transactions)
        .where(
          or(
            inArray(transactions.walletId, ownedWalletIds),
            inArray(transactions.targetWalletId, ownedWalletIds)
          )
        );

      await tx
        .delete(recurringRules)
        .where(inArray(recurringRules.walletId, ownedWalletIds));
    }

    // Delete any transactions/invites authored by this user on shared wallets
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(walletInvites).where(eq(walletInvites.createdBy, userId));

    if (ownedWalletIds.length > 0) {
      await tx.delete(wallets).where(inArray(wallets.id, ownedWalletIds));
    }

    // Finally delete the user (cascades sessions, categories, budgets, goals, split_bills, debts, bank_integrations, reset tokens)
    await tx.delete(users).where(eq(users.id, userId));
  });
}
