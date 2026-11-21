import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, type AppDb } from "@/db";
import { sessions, users, walletMembers, wallets } from "@/db/schema";
import { AppError } from "@/lib/errors";
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
export function createSession(
  db: AppDb,
  userId: string,
  userAgent?: string | null
): { token: string; expiresAt: string } {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.insert(sessions)
    .values({
      id: tokenHash,
      userId,
      expiresAt,
      userAgent: userAgent ?? null,
      createdAt: now.toISOString(),
    })
    .run();

  return { token: rawToken, expiresAt };
}

/**
 * Resolves a raw session token to a SafeUser, deleting the session if expired.
 */
export function getUserBySessionToken(
  db: AppDb,
  rawToken: string
): SafeUser | null {
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const row = db
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
    .get();

  if (!row) {
    return null;
  }

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, tokenHash)).run();
    return null;
  }

  return toSafeUser(row.user);
}

/**
 * Deletes a session by raw token if it exists.
 */
export function destroySession(db: AppDb, rawToken: string): void {
  if (!rawToken) {
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  db.delete(sessions).where(eq(sessions.id, tokenHash)).run();
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

  return getUserBySessionToken(getDb(), rawToken);
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

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (existing) {
    throw new AppError(409, "Email sudah terdaftar.");
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const defaultWalletId = crypto.randomUUID();

  try {
    db.transaction((tx) => {
      tx.insert(users)
        .values({
          id: userId,
          name,
          email,
          passwordHash,
          monthlySavingsTarget: 0,
          createdAt: now,
        })
        .run();

      tx.insert(wallets)
        .values({
          id: defaultWalletId,
          ownerId: userId,
          name: "Dompet Utama",
          type: "cash",
          initialBalance: 0,
          balance: 0,
          isShared: false,
          createdAt: now,
        })
        .run();

      tx.insert(walletMembers)
        .values({
          id: crypto.randomUUID(),
          walletId: defaultWalletId,
          userId,
          role: "owner",
          createdAt: now,
        })
        .run();

      seedDefaultCategoriesForUser(tx as unknown as AppDb, userId);
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("unique")
    ) {
      throw new AppError(409, "Email sudah terdaftar.");
    }
    throw err;
  }

  const session = createSession(db, userId, userAgent);
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
  const row = db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!row) {
    throw new AppError(401, "Email atau kata sandi salah.");
  }

  const valid = await verifyPassword(input.password, row.passwordHash);
  if (!valid) {
    throw new AppError(401, "Email atau kata sandi salah.");
  }

  const session = createSession(db, row.id, userAgent);
  return {
    user: toSafeUser(row),
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

/**
 * Updates the user's display name and monthly savings target percentage.
 */
export function updateUserProfile(
  db: AppDb,
  userId: string,
  input: { name: string; monthlySavingsTarget: number }
): SafeUser {
  const name = input.name.trim();
  const target = Math.round(input.monthlySavingsTarget);

  const updated = db
    .update(users)
    .set({
      name,
      monthlySavingsTarget: target,
    })
    .where(eq(users.id, userId))
    .returning()
    .get();

  if (!updated) {
    throw new AppError(404, "Pengguna tidak ditemukan.");
  }

  return toSafeUser(updated);
}

/**
 * Changes the password for a non-demo user after verifying the current password.
 */
export async function changePassword(
  db: AppDb,
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
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
  db.update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, userId))
    .run();
}
