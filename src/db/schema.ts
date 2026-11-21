import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  monthlySavingsTarget: integer("monthly_savings_target").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
});

export const wallets = pgTable("wallets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["cash", "bank", "ewallet", "savings"] }).notNull(),
  initialBalance: bigint("initial_balance", { mode: "number" }).notNull(),
  balance: bigint("balance", { mode: "number" }).notNull(),
  isShared: boolean("is_shared").notNull().default(false),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
});

export const walletMembers = pgTable(
  "wallet_members",
  {
    id: text("id").primaryKey(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_wallet_members_unique").on(table.walletId, table.userId),
  ]
);

export const walletInvites = pgTable("wallet_invites", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  email: text("email"),
  role: text("role", { enum: ["editor", "viewer"] }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const recurringRules = pgTable("recurring_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletId: text("wallet_id")
    .notNull()
    .references(() => wallets.id),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  title: text("title").notNull(),
  frequency: text("frequency", { enum: ["weekly", "monthly"] }).notNull(),
  nextRunDate: text("next_run_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id")
    .notNull()
    .references(() => wallets.id),
  targetWalletId: text("target_wallet_id").references(() => wallets.id),
  categoryId: text("category_id").references(() => categories.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  paymentMethod: text("payment_method"),
  occurredAt: text("occurred_at").notNull(),
  attachmentPath: text("attachment_path"),
  attachmentName: text("attachment_name"),
  attachmentMime: text("attachment_mime"),
  recurringRuleId: text("recurring_rule_id").references(
    () => recurringRules.id
  ),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const transactionAttachments = pgTable("transaction_attachments", {
  transactionId: text("transaction_id")
    .primaryKey()
    .references(() => transactions.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
});

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    limitAmount: bigint("limit_amount", { mode: "number" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_budgets_unique").on(
      table.userId,
      table.categoryId,
      table.month
    ),
  ]
);

export const savingsGoals = pgTable("savings_goals", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletId: text("wallet_id").references(() => wallets.id),
  name: text("name").notNull(),
  targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
  currentAmount: bigint("current_amount", { mode: "number" })
    .notNull()
    .default(0),
  deadline: text("deadline"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const bankIntegrations = pgTable(
  "bank_integrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["bca"] }).notNull(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    webhookTokenHash: text("webhook_token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    autoCategorize: boolean("auto_categorize").notNull().default(true),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_bank_integrations_user_provider").on(
      table.userId,
      table.provider
    ),
  ]
);

export const bankSyncLogs = pgTable("bank_sync_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  integrationId: text("integration_id").references(() => bankIntegrations.id, {
    onDelete: "set null",
  }),
  walletId: text("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  source: text("source", {
    enum: ["webhook_email", "webhook_push", "csv_import", "simulator"],
  }).notNull(),
  dedupeHash: text("dedupe_hash").notNull(),
  transactionId: text("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  status: text("status", {
    enum: ["imported", "duplicate", "failed"],
  }).notNull(),
  rawSnippet: text("raw_snippet").notNull(),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: bigint("reset_at", { mode: "number" }).notNull(),
});
