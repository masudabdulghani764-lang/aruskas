export type SchemaExecutor = {
  exec?: (sql: string) => Promise<unknown>;
  query: (sql: string) => Promise<unknown>;
};

export const SCHEMA_SQL = `
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
    initial_balance BIGINT NOT NULL,
    balance BIGINT NOT NULL,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
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
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recurring_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id TEXT NOT NULL REFERENCES wallets(id),
    category_id TEXT NOT NULL REFERENCES categories(id),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    title TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
    next_run_date TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL REFERENCES wallets(id),
    target_wallet_id TEXT REFERENCES wallets(id),
    category_id TEXT REFERENCES categories(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount BIGINT NOT NULL CHECK (amount > 0),
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

  CREATE TABLE IF NOT EXISTS transaction_attachments (
    transaction_id TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    limit_amount BIGINT NOT NULL CHECK (limit_amount > 0),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id TEXT REFERENCES wallets(id),
    name TEXT NOT NULL,
    target_amount BIGINT NOT NULL CHECK (target_amount > 0),
    current_amount BIGINT NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
    deadline TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bank_integrations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('bca')),
    wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    webhook_token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_categorize BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bank_sync_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    integration_id TEXT REFERENCES bank_integrations(id) ON DELETE SET NULL,
    wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('webhook_email', 'webhook_push', 'csv_import', 'simulator')),
    dedupe_hash TEXT NOT NULL,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('imported', 'duplicate', 'failed')),
    raw_snippet TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_integrations_user_provider
    ON bank_integrations(user_id, provider);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_sync_dedupe
    ON bank_sync_logs(wallet_id, dedupe_hash)
    WHERE status = 'imported';

  CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_user_created
    ON bank_sync_logs(user_id, created_at DESC);

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
  CREATE INDEX IF NOT EXISTS idx_recurring_rules_active_next ON recurring_rules(is_active, next_run_date);

  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

  ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
    ON users(google_sub)
    WHERE google_sub IS NOT NULL;

  CREATE TABLE IF NOT EXISTS split_bills (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount > 0),
    occurred_at TEXT NOT NULL,
    bank_name TEXT,
    account_number TEXT,
    account_holder TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS split_bill_participants (
    id TEXT PRIMARY KEY,
    split_bill_id TEXT NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_split_bills_user_created
    ON split_bills(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_split_bills_tx
    ON split_bills(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_split_bill_participants_bill
    ON split_bill_participants(split_bill_id);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON password_reset_tokens(user_id);

  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('payable', 'receivable')),
    person_name TEXT NOT NULL,
    title TEXT NOT NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount > 0),
    paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    due_date TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_debts_user_status
    ON debts(user_id, status, created_at DESC);

  ALTER TABLE bank_integrations
    ADD COLUMN IF NOT EXISTS provider_wallet_map TEXT NOT NULL DEFAULT '{}';

  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

  CREATE TABLE IF NOT EXISTS security_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    ip_masked TEXT NOT NULL,
    user_agent TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_created
    ON security_audit_logs(user_id, created_at DESC);

  DO $$
  BEGIN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END $$;
`;

/**
 * Initializes all ArusKas PostgreSQL tables, unique constraints, partial unique indexes,
 * and query performance indexes idempotently.
 */
export async function initSchema(executor: SchemaExecutor): Promise<void> {
  if (typeof executor.exec === "function") {
    await executor.exec(SCHEMA_SQL);
  } else {
    await executor.query(SCHEMA_SQL);
  }
}
