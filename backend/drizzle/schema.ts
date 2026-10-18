import {
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** Local password auth is opt-in; OAuth-created users keep this null. */
  passwordHash: text("passwordHash"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Existing opaque-token session table. Never store the browser token itself. */
export const appSessions = mysqlTable("app_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

/** Existing one-row-per-account JSON state store. */
export const portfolioStates = mysqlTable("portfolio_states", {
  userId: int("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stateJson: longtext("stateJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSession = typeof appSessions.$inferSelect;
export type PortfolioStateRow = typeof portfolioStates.$inferSelect;

/** Task 8: Family Plans - Shared family workspaces with strict server-side authorization. */
export const familyPlans = mysqlTable("family_plans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerId: int("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const familyMembers = mysqlTable(
  "family_members",
  {
    id: int("id").autoincrement().primaryKey(),
    familyId: varchar("familyId", { length: 64 })
      .notNull()
      .references(() => familyPlans.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["owner", "editor", "viewer"])
      .default("viewer")
      .notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("uk_family_user").on(table.familyId, table.userId),
  ]
);

export const familyInvitations = mysqlTable("family_invitations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  familyId: varchar("familyId", { length: 64 })
    .notNull()
    .references(() => familyPlans.id, { onDelete: "cascade" }),
  inviterId: int("inviterId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  role: mysqlEnum("role", ["editor", "viewer"]).default("viewer").notNull(),
  status: mysqlEnum("status", [
    "pending",
    "accepted",
    "declined",
    "revoked",
    "expired",
  ])
    .default("pending")
    .notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});

export const familyPortfolioStates = mysqlTable("family_portfolio_states", {
  familyId: varchar("familyId", { length: 64 })
    .primaryKey()
    .references(() => familyPlans.id, { onDelete: "cascade" }),
  stateJson: longtext("stateJson").notNull(),
  updatedBy: int("updatedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FamilyPlanRow = typeof familyPlans.$inferSelect;
export type InsertFamilyPlan = typeof familyPlans.$inferInsert;
export type FamilyMemberRow = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;
export type FamilyInvitationRow = typeof familyInvitations.$inferSelect;
export type InsertFamilyInvitation = typeof familyInvitations.$inferInsert;
export type FamilyPortfolioStateRow = typeof familyPortfolioStates.$inferSelect;
export type InsertFamilyPortfolioState = typeof familyPortfolioStates.$inferInsert;
