import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  monthlySavingsTarget: integer("monthly_savings_target").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
});

export const wallets = sqliteTable("wallets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["cash", "bank", "ewallet", "savings"] }).notNull(),
  initialBalance: integer("initial_balance").notNull(),
  balance: integer("balance").notNull(),
  isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
});

export const walletMembers = sqliteTable(
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

export const walletInvites = sqliteTable("wallet_invites", {
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

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const recurringRules = sqliteTable("recurring_rules", {
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
  amount: integer("amount").notNull(),
  title: text("title").notNull(),
  frequency: text("frequency", { enum: ["weekly", "monthly"] }).notNull(),
  nextRunDate: text("next_run_date").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
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
  amount: integer("amount").notNull(),
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

export const budgets = sqliteTable(
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
    limitAmount: integer("limit_amount").notNull(),
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

export const savingsGoals = sqliteTable("savings_goals", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletId: text("wallet_id").references(() => wallets.id),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(),
  currentAmount: integer("current_amount").notNull().default(0),
  deadline: text("deadline"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});
