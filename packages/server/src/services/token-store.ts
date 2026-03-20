/**
 * Token Store — persists Twitch OAuth tokens to a local JSON file.
 * Stored in packages/server/data/tokens.json (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const TOKEN_FILE = join(DATA_DIR, "tokens.json");

export interface StoredTokens {
  /** The bot account's access token */
  botAccessToken: string;
  /** The bot account's refresh token */
  botRefreshToken: string;
  /** The bot account's Twitch user ID */
  botUserId: string;
  /** Scopes the token was granted */
  botScopes: string[];
  /** When the access token was last refreshed (ISO string) */
  botTokenUpdatedAt: string;

  /** The broadcaster's access token (for channel:bot scope) */
  broadcasterAccessToken?: string;
  /** The broadcaster's refresh token */
  broadcasterRefreshToken?: string;
  /** The broadcaster's Twitch user ID */
  broadcasterUserId?: string;
  /** Scopes the broadcaster token was granted */
  broadcasterScopes?: string[];
  /** When the broadcaster token was last refreshed (ISO string) */
  broadcasterTokenUpdatedAt?: string;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadTokens(): StoredTokens | null {
  ensureDataDir();
  if (!existsSync(TOKEN_FILE)) return null;

  try {
    const raw = readFileSync(TOKEN_FILE, "utf-8");
    return JSON.parse(raw) as StoredTokens;
  } catch {
    console.error("Failed to parse tokens.json — will need to re-authorize.");
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  ensureDataDir();
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

export function updateBotTokens(
  accessToken: string,
  refreshToken: string,
  userId: string,
  scopes: string[]
): StoredTokens {
  const existing = loadTokens();
  const updated: StoredTokens = {
    ...(existing ?? {
      botAccessToken: "",
      botRefreshToken: "",
      botUserId: "",
      botScopes: [],
      botTokenUpdatedAt: "",
    }),
    botAccessToken: accessToken,
    botRefreshToken: refreshToken,
    botUserId: userId,
    botScopes: scopes,
    botTokenUpdatedAt: new Date().toISOString(),
  };
  saveTokens(updated);
  return updated;
}

export function updateBroadcasterTokens(
  accessToken: string,
  refreshToken: string,
  userId: string,
  scopes: string[]
): StoredTokens {
  const existing = loadTokens();
  if (!existing) {
    throw new Error("Bot tokens must be set up before broadcaster tokens.");
  }
  const updated: StoredTokens = {
    ...existing,
    broadcasterAccessToken: accessToken,
    broadcasterRefreshToken: refreshToken,
    broadcasterUserId: userId,
    broadcasterScopes: scopes,
    broadcasterTokenUpdatedAt: new Date().toISOString(),
  };
  saveTokens(updated);
  return updated;
}
