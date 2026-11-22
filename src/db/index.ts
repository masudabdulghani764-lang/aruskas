import path from "node:path";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { initSchema } from "./migrate";
import * as schema from "./schema";

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type CreatedDb = {
  db: AppDb;
  close: () => Promise<void>;
  queryRaw: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
};

function isPostgresUrl(value: string): boolean {
  return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

function resolveConnectionTarget(): string {
  const overridePath = process.env.DATABASE_PATH?.trim();
  if (overridePath) {
    return overridePath;
  }
  const envUrl =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    "";
  if (envUrl) {
    return envUrl;
  }
  return path.join(process.cwd(), "data", "aruskas-pglite");
}

/**
 * Creates a PostgreSQL + Drizzle database instance.
 * - For `postgres://` / `postgresql://` URLs: uses `pg.Pool` (Neon / Postgres) with
 *   Vercel Fluid Compute `attachDatabasePool`.
 * - For `":memory:"` or local filesystem paths (tests / offline dev): uses embedded
 *   PostgreSQL via `@electric-sql/pglite` so unit tests run against real Postgres.
 */
export async function createDb(target = ":memory:"): Promise<CreatedDb> {
  if (isPostgresUrl(target)) {
    const isLocalPg =
      /localhost|127\.0\.0\.1/i.test(target) || /sslmode=disable/i.test(target);
    const pool = new Pool({
      connectionString: target,
      ...(isLocalPg ? {} : { ssl: { rejectUnauthorized: true } }),
      max: 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    });

    if (process.env.VERCEL) {
      attachDatabasePool(pool);
    }

    await initSchema(pool);
    const db = drizzleNodePg(pool, { schema }) as unknown as AppDb;

    return {
      db,
      close: async () => {
        await pool.end();
      },
      queryRaw: async (sql: string) => {
        const res = await pool.query(sql);
        return { rows: res.rows as Record<string, unknown>[] };
      },
    };
  }

  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);

  const pglite =
    target === ":memory:" || target.startsWith("memory://")
      ? new PGlite()
      : new PGlite(target);
  await initSchema(pglite);
  const db = drizzlePglite(pglite, { schema }) as unknown as AppDb;

  return {
    db,
    close: async () => {
      await pglite.close();
    },
    queryRaw: async (sql: string) => {
      const res = await pglite.query(sql);
      return { rows: res.rows as Record<string, unknown>[] };
    },
  };
}

const globalForDb = globalThis as unknown as {
  __aruskasDbPromise?: Promise<CreatedDb>;
  __aruskasDbTarget?: string;
};

/**
 * Safely closes the cached singleton database pool/instance if open.
 */
export async function closeDb(): Promise<void> {
  const existing = globalForDb.__aruskasDbPromise;
  globalForDb.__aruskasDbPromise = undefined;
  globalForDb.__aruskasDbTarget = undefined;

  if (existing) {
    try {
      const created = await existing;
      await created.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Returns the lazy singleton PostgreSQL database instance for `DATABASE_URL`
 * (Neon Postgres on Vercel and local `.env.local`), initializing the schema once
 * per process lifetime.
 */
export async function getDb(): Promise<AppDb> {
  const target = resolveConnectionTarget();

  if (!globalForDb.__aruskasDbPromise || globalForDb.__aruskasDbTarget !== target) {
    await closeDb();
    globalForDb.__aruskasDbTarget = target;
    globalForDb.__aruskasDbPromise = createDb(target).catch((err) => {
      globalForDb.__aruskasDbPromise = undefined;
      globalForDb.__aruskasDbTarget = undefined;
      throw err;
    });
  }

  const created = await globalForDb.__aruskasDbPromise;
  return created.db;
}
