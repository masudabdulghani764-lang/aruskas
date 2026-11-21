import type { Database } from "bun:sqlite";

/**
 * Initializes all ArusKas SQLite tables, unique constraints, partial unique indexes,
 * and query performance indexes idempotently.
 */
export function initSchema(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      monthly_savings_target INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'ewallet', 'savings')),
      initial_balance INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      is_shared INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_members (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_invites (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      email TEXT,
      role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wallet_id TEXT NOT NULL REFERENCES wallets(id),
      category_id TEXT NOT NULL REFERENCES categories(id),
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      title TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
      next_run_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL REFERENCES wallets(id),
      target_wallet_id TEXT REFERENCES wallets(id),
      category_id TEXT REFERENCES categories(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      title TEXT NOT NULL,
      notes TEXT,
      payment_method TEXT,
      occurred_at TEXT NOT NULL,
      attachment_path TEXT,
      attachment_name TEXT,
      attachment_mime TEXT,
      recurring_rule_id TEXT REFERENCES recurring_rules(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      limit_amount INTEGER NOT NULL CHECK (limit_amount > 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wallet_id TEXT REFERENCES wallets(id),
      name TEXT NOT NULL,
      target_amount INTEGER NOT NULL CHECK (target_amount > 0),
      current_amount INTEGER NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
      deadline TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_members_unique
      ON wallet_members(wallet_id, user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique
      ON budgets(user_id, category_id, month);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_unique
      ON transactions(recurring_rule_id, occurred_at)
      WHERE recurring_rule_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_wallets_owner_id ON wallets(owner_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_members_user_id ON wallet_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_invites_wallet_id ON wallet_invites(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_invites_email ON wallet_invites(email);
    CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet_occurred ON transactions(wallet_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_target_wallet ON transactions(target_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred ON transactions(user_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_rules_user_next ON recurring_rules(user_id, next_run_date);
  `);
}
