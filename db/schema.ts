import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaignRecords = sqliteTable("campaign_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  status: text("status").notNull().default("active"),
  difficulty: text("difficulty").notNull().default("operative"),
  timeOfDay: text("time_of_day").notNull().default("day"),
  wave: integer("wave").notNull().default(1),
  score: integer("score").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  shots: integer("shots").notNull().default(0),
  hits: integer("hits").notNull().default(0),
  takedowns: integer("takedowns").notNull().default(0),
  roadkills: integer("roadkills").notNull().default(0),
  health: integer("health").notNull().default(100),
  shield: integer("shield").notNull().default(50),
  armor: integer("armor").notNull().default(100),
  weaponIndex: integer("weapon_index").notNull().default(0),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("campaign_user_updated_idx").on(table.userEmail, table.updatedAt),
]);
