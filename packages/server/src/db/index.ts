import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "./data/horde-and-hoard.db";

export function createDatabase() {
  // Ensure data directory exists
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });

  // Bootstrap all tables
  initializeTables(sqlite);

  return db;
}

function initializeTables(sqlite: Database.Database) {
  sqlite.exec(`
    -- Players
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitch_id TEXT NOT NULL UNIQUE,
      twitch_username TEXT NOT NULL,
      twitch_display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      sub_tier INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    -- Imps
    CREATE TABLE IF NOT EXISTS imps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id),
      name TEXT NOT NULL,
      appearance TEXT NOT NULL,
      weapon TEXT NOT NULL DEFAULT 'sword',
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      max_hp INTEGER NOT NULL DEFAULT 12,
      attack INTEGER NOT NULL DEFAULT 3,
      defense INTEGER NOT NULL DEFAULT 0,
      speed INTEGER NOT NULL DEFAULT 3,
      luck INTEGER NOT NULL DEFAULT 1,
      fervor INTEGER NOT NULL DEFAULT 3,
      skill_points INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0
    );

    -- Skills
    CREATE TABLE IF NOT EXISTS learned_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imp_id INTEGER NOT NULL REFERENCES imps(id),
      skill_id TEXT NOT NULL,
      slot_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unlocked_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id),
      skill_id TEXT NOT NULL
    );

    -- Cosmetics
    CREATE TABLE IF NOT EXISTS cosmetic_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id),
      item_id TEXT NOT NULL,
      source TEXT NOT NULL,
      acquired_at INTEGER NOT NULL
    );

    -- Keep (migration adds wood/stone/bones columns to existing tables)
    CREATE TABLE IF NOT EXISTS keep (
      id INTEGER PRIMARY KEY,
      gold INTEGER NOT NULL DEFAULT 0,
      materials INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO keep (id, gold, materials) VALUES (1, 0, 0);

    CREATE TABLE IF NOT EXISTS keep_upgrades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upgrade_id TEXT NOT NULL UNIQUE,
      upgrade_type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      completed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keep_treasures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treasure_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      adventure_id INTEGER REFERENCES adventures(id),
      tier INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL,
      effect TEXT NOT NULL,
      acquired_at INTEGER NOT NULL
    );

    -- Adventures
    CREATE TABLE IF NOT EXISTS adventures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      outcome TEXT,
      areas_visited TEXT NOT NULL DEFAULT '[]',
      areas_completed INTEGER NOT NULL DEFAULT 0,
      participant_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS adventure_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adventure_id INTEGER NOT NULL REFERENCES adventures(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      survived INTEGER NOT NULL DEFAULT 1,
      steps_participated INTEGER NOT NULL DEFAULT 0,
      enemies_killed INTEGER NOT NULL DEFAULT 0,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      gold_earned INTEGER NOT NULL DEFAULT 0,
      ejected_at_step INTEGER
    );

    -- Player Stats (lifetime tracking)
    CREATE TABLE IF NOT EXISTS player_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL UNIQUE REFERENCES players(id),
      total_kills INTEGER NOT NULL DEFAULT 0,
      total_adventures INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt INTEGER NOT NULL DEFAULT 0,
      total_damage_by_weapon TEXT NOT NULL DEFAULT '{}',
      total_gold_earned INTEGER NOT NULL DEFAULT 0,
      total_healing_done INTEGER NOT NULL DEFAULT 0,
      successful_adventures INTEGER NOT NULL DEFAULT 0,
      total_deaths INTEGER NOT NULL DEFAULT 0,
      total_damage_taken INTEGER NOT NULL DEFAULT 0,
      total_assists INTEGER NOT NULL DEFAULT 0,
      combats_participated INTEGER NOT NULL DEFAULT 0,
      highest_damage_single_hit INTEGER NOT NULL DEFAULT 0,
      total_crits INTEGER NOT NULL DEFAULT 0,
      enemies_killed_by_type TEXT NOT NULL DEFAULT '{}'
    );

    -- Combat Logs
    CREATE TABLE IF NOT EXISTS combat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adventure_id INTEGER NOT NULL REFERENCES adventures(id),
      step_number INTEGER NOT NULL,
      area_id TEXT NOT NULL,
      is_boss INTEGER NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL,
      total_turns INTEGER NOT NULL,
      actions TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Migration: convert old 'materials' column to typed materials (wood, stone, bones)
  runMigrations(sqlite);
}

function runMigrations(sqlite: Database.Database) {
  // Check if old 'materials' column exists on keep table
  const keepColumns = sqlite.pragma("table_info(keep)") as { name: string }[];
  const hasMaterials = keepColumns.some((c) => c.name === "materials");
  const hasWood = keepColumns.some((c) => c.name === "wood");

  if (hasMaterials && !hasWood) {
    console.log("[DB Migration] Converting keep.materials → wood, stone, bones");
    sqlite.exec(`
      ALTER TABLE keep ADD COLUMN wood INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE keep ADD COLUMN stone INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE keep ADD COLUMN bones INTEGER NOT NULL DEFAULT 0;
      UPDATE keep SET stone = materials WHERE wood = 0 AND stone = 0;
    `);
  }
}

export type DrizzleDB = ReturnType<typeof createDatabase>;
