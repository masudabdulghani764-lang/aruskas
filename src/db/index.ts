import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { initSchema } from "./migrate";
import * as schema from "./schema";

export type AppDb = BunSQLiteDatabase<typeof schema>;

/**
 * Creates a Bun SQLite + Drizzle database instance, enabling foreign keys,
 * WAL mode for file-backed databases, and initializing the schema.
 */
export function createDb(dbPath = ":memory:"): {
  db: AppDb;
  sqlite: Database;
} {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  if (dbPath !== ":memory:") {
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA busy_timeout = 5000;");
  }

  initSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

const globalForDb = globalThis as unknown as {
  __aruskasDb?: AppDb;
  __aruskasSqlite?: Database;
  __aruskasDbPath?: string;
};

/**
 * Safely closes the cached singleton SQLite database handle if open.
 */
export function closeDb(): void {
  const sqlite = globalForDb.__aruskasSqlite;
  if (sqlite) {
    try {
      sqlite.close(true);
    } catch {
      try {
        sqlite.close();
      } catch {
        // Ignore errors if already closed
      }
    }
  }
  globalForDb.__aruskasDb = undefined;
  globalForDb.__aruskasSqlite = undefined;
  globalForDb.__aruskasDbPath = undefined;
}

/**
 * Returns the lazy singleton database instance for the configured DATABASE_PATH
 * or default `data/aruskas.db`.
 */
export function getDb(): AppDb {
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "aruskas.db");

  if (!globalForDb.__aruskasDb || globalForDb.__aruskasDbPath !== dbPath) {
    closeDb();
    const { db, sqlite } = createDb(dbPath);
    globalForDb.__aruskasDb = db;
    globalForDb.__aruskasSqlite = sqlite;
    globalForDb.__aruskasDbPath = dbPath;
  }

  return globalForDb.__aruskasDb;
}
