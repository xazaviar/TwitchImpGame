import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Players ─────────────────────────────────────────

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  twitchId: text("twitch_id").notNull().unique(),
  twitchUsername: text("twitch_username").notNull(),
  twitchDisplayName: text("twitch_display_name").notNull(),
  role: text("role", {
    enum: ["viewer", "follower", "subscriber", "admin"],
  })
    .notNull()
    .default("viewer"),
  subTier: integer("sub_tier").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
});

// ─── Imps ────────────────────────────────────────────

export const imps = sqliteTable("imps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  name: text("name").notNull(),
  appearance: text("appearance", { mode: "json" }).notNull(),
  weapon: text("weapon").notNull().default("sword"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  maxHp: integer("max_hp").notNull().default(20),
  attack: integer("attack").notNull().default(5),
  defense: integer("defense").notNull().default(3),
  speed: integer("speed").notNull().default(5),
  skillPoints: integer("skill_points").notNull().default(0),
  gold: integer("gold").notNull().default(0),
});

// ─── Skills ──────────────────────────────────────────

export const learnedSkills = sqliteTable("learned_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  impId: integer("imp_id")
    .notNull()
    .references(() => imps.id),
  skillId: text("skill_id").notNull(),
  slotIndex: integer("slot_index").notNull(),
});

export const unlockedSkills = sqliteTable("unlocked_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  skillId: text("skill_id").notNull(),
});

// ─── Cosmetics ───────────────────────────────────────

export const cosmeticItems = sqliteTable("cosmetic_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  itemId: text("item_id").notNull(),
  source: text("source", {
    enum: ["achievement", "gift", "purchase"],
  }).notNull(),
  acquiredAt: integer("acquired_at", { mode: "timestamp" }).notNull(),
});

// ─── Keep ────────────────────────────────────────────

export const keep = sqliteTable("keep", {
  id: integer("id").primaryKey(),
  gold: integer("gold").notNull().default(0),
  materials: integer("materials").notNull().default(0),
});

export const keepUpgrades = sqliteTable("keep_upgrades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  upgradeId: text("upgrade_id").notNull().unique(),
  upgradeType: text("upgrade_type", {
    enum: ["walls", "armory", "ballista", "barracks", "treasury"],
  }).notNull(),
  level: integer("level").notNull().default(1),
  completedAt: integer("completed_at", { mode: "timestamp" }).notNull(),
});

export const keepTreasures = sqliteTable("keep_treasures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  treasureId: text("treasure_id").notNull(),
  areaId: text("area_id").notNull(),
  adventureId: integer("adventure_id").references(() => adventures.id),
  tier: integer("tier").notNull().default(1),
  type: text("type", {
    enum: ["passive_bonus", "weapon_unlock", "cosmetic_trophy", "other"],
  }).notNull(),
  effect: text("effect", { mode: "json" }).notNull(),
  acquiredAt: integer("acquired_at", { mode: "timestamp" }).notNull(),
});

// ─── Adventures ──────────────────────────────────────

export const adventures = sqliteTable("adventures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  outcome: text("outcome", {
    enum: ["success", "failure", "abandoned"],
  }),
  areasVisited: text("areas_visited", { mode: "json" }).notNull().default("[]"),
  areasCompleted: integer("areas_completed").notNull().default(0),
  participantCount: integer("participant_count").notNull().default(0),
});

export const adventureParticipants = sqliteTable("adventure_participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adventureId: integer("adventure_id")
    .notNull()
    .references(() => adventures.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  survived: integer("survived", { mode: "boolean" }).notNull().default(true),
  stepsParticipated: integer("steps_participated").notNull().default(0),
  enemiesKilled: integer("enemies_killed").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  goldEarned: integer("gold_earned").notNull().default(0),
  ejectedAtStep: integer("ejected_at_step"),
});

// ─── Combat Logs ─────────────────────────────────────

export const combatLogs = sqliteTable("combat_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adventureId: integer("adventure_id")
    .notNull()
    .references(() => adventures.id),
  stepNumber: integer("step_number").notNull(),
  areaId: text("area_id").notNull(),
  isBoss: integer("is_boss", { mode: "boolean" }).notNull().default(false),
  outcome: text("outcome", { enum: ["victory", "defeat"] }).notNull(),
  totalTurns: integer("total_turns").notNull(),
  actions: text("actions", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
