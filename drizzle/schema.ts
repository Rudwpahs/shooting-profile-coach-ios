import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** A private, account-scoped profile. OAuth creates the user row on first sign-in. */
export const personalProfiles = mysqlTable("personal_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  displayName: varchar("displayName", { length: 80 }).notNull(),
  privacy: mysqlEnum("privacy", ["private"]).default("private").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("personal_profiles_user_id_uq").on(table.userId)]);

/**
 * Stores only the compact, phase-selected pose candidate and quality report.
 * Raw videos are intentionally never persisted by this table.
 */
export const personalPoseAnalyses = mysqlTable("personal_pose_analyses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceLabel: varchar("sourceLabel", { length: 160 }).notNull(),
  poseSpace: mysqlEnum("poseSpace", ["monocular_relative_pose", "calibrated_multi_view_3d"])
    .default("monocular_relative_pose")
    .notNull(),
  status: mysqlEnum("status", ["candidate", "rejected", "approved_private"])
    .default("candidate")
    .notNull(),
  privacy: mysqlEnum("privacy", ["private"]).default("private").notNull(),
  poseJson: text("poseJson").notNull(),
  qualityJson: text("qualityJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PersonalProfile = typeof personalProfiles.$inferSelect;
export type PersonalPoseAnalysis = typeof personalPoseAnalyses.$inferSelect;
