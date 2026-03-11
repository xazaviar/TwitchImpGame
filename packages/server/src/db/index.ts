import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "./data/imp-adventure.db";

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

  // Initialize the keep table with a single row if it doesn't exist
  initializeKeep(db);

  return db;
}

function initializeKeep(db: ReturnType<typeof drizzle>) {
  const sqlite = (db as any).session?.client as Database.Database | undefined;
  if (sqlite) {
    // Create tables if they don't exist (basic bootstrap - migrations handle the real schema)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS keep (
        id INTEGER PRIMARY KEY,
        gold INTEGER NOT NULL DEFAULT 0,
        materials INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO keep (id, gold, materials) VALUES (1, 0, 0);
    `);
  }
}

export type DrizzleDB = ReturnType<typeof createDatabase>;
