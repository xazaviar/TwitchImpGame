/**
 * Player & Imp management — database operations for creating/fetching players and imps.
 */
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.js";
import { players, imps, keep } from "../db/schema.js";
import { BASE_WEAPONS } from "@imp/shared";

const IMP_NAMES = [
  "Gnarltooth",
  "Sizzlefang",
  "Brimwick",
  "Skorch",
  "Nibbleclaw",
  "Duskpoke",
  "Flamebelch",
  "Grimbly",
  "Wortsnag",
  "Cinders",
  "Blightwing",
  "Smoldergut",
  "Crackjaw",
  "Hexwhistle",
  "Murktail",
  "Scorchpaw",
  "Dregfin",
  "Ashscuttle",
  "Thornwick",
  "Emberspit",
];

const STARTER_WEAPONS = ["sword", "bow", "staff", "cross", "shield"];

export interface PlayerRecord {
  id: number;
  twitchId: string;
  twitchUsername: string;
  twitchDisplayName: string;
  role: string;
  subTier: number;
}

export interface ImpRecord {
  id: number;
  playerId: number;
  name: string;
  weapon: string;
  level: number;
  xp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  gold: number;
}

export interface KeepRecord {
  gold: number;
  materials: number;
}

export class PlayerService {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /** Get or create a player + imp by Twitch info. Returns {player, imp, isNew}. */
  async getOrCreatePlayer(
    twitchId: string,
    username: string,
    displayName: string
  ): Promise<{ player: PlayerRecord; imp: ImpRecord; isNew: boolean }> {
    // Check if player exists
    const existing = this.db
      .select()
      .from(players)
      .where(eq(players.twitchId, twitchId))
      .get();

    if (existing) {
      // Update last seen
      this.db
        .update(players)
        .set({
          lastSeenAt: new Date(),
          twitchUsername: username,
          twitchDisplayName: displayName,
        })
        .where(eq(players.id, existing.id))
        .run();

      // Get imp
      const imp = this.db
        .select()
        .from(imps)
        .where(eq(imps.playerId, existing.id))
        .get();

      if (!imp) {
        const newImp = this.createImp(existing.id);
        return { player: existing as PlayerRecord, imp: newImp, isNew: false };
      }

      return { player: existing as PlayerRecord, imp: imp as ImpRecord, isNew: false };
    }

    // Create new player
    const now = new Date();
    const result = this.db
      .insert(players)
      .values({
        twitchId,
        twitchUsername: username,
        twitchDisplayName: displayName,
        role: "viewer",
        subTier: 0,
        createdAt: now,
        lastSeenAt: now,
      })
      .run();

    const playerId = Number(result.lastInsertRowid);
    const player: PlayerRecord = {
      id: playerId,
      twitchId,
      twitchUsername: username,
      twitchDisplayName: displayName,
      role: "viewer",
      subTier: 0,
    };

    const imp = this.createImp(playerId);

    return { player, imp, isNew: true };
  }

  /** Create an imp for a player with a random name and random starting weapon */
  private createImp(playerId: number): ImpRecord {
    const name = this.pickRandomName();
    const weaponId = STARTER_WEAPONS[Math.floor(Math.random() * STARTER_WEAPONS.length)];
    const weapon = BASE_WEAPONS[weaponId];

    const result = this.db
      .insert(imps)
      .values({
        playerId,
        name,
        appearance: JSON.stringify({
          color: "#e94560",
          horns: "default",
          eyes: "default",
          mouth: "default",
          nose: "default",
          extras: [],
          cosmetics: [],
        }),
        weapon: weaponId,
        level: 1,
        xp: 0,
        maxHp: weapon.baseStats.maxHp,
        attack: weapon.baseStats.attack,
        defense: weapon.baseStats.defense,
        speed: weapon.baseStats.speed,
        skillPoints: 0,
        gold: 0,
      })
      .run();

    return {
      id: Number(result.lastInsertRowid),
      playerId,
      name,
      weapon: weaponId,
      level: 1,
      xp: 0,
      maxHp: weapon.baseStats.maxHp,
      attack: weapon.baseStats.attack,
      defense: weapon.baseStats.defense,
      speed: weapon.baseStats.speed,
      gold: 0,
    };
  }

  /** Pick a random imp name, avoiding names already in use */
  private pickRandomName(): string {
    const usedNames = new Set(
      this.db.select({ name: imps.name }).from(imps).all().map((r) => r.name)
    );
    const available = IMP_NAMES.filter((n) => !usedNames.has(n));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    // All 20 taken — append a number suffix
    const base = IMP_NAMES[Math.floor(Math.random() * IMP_NAMES.length)];
    return `${base} ${usedNames.size + 1}`;
  }

  /** Check if a player exists by Twitch ID */
  playerExists(twitchId: string): boolean {
    const row = this.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.twitchId, twitchId))
      .get();
    return !!row;
  }

  /** Get player by Twitch ID */
  getPlayerByTwitchId(twitchId: string): PlayerRecord | null {
    const row = this.db
      .select()
      .from(players)
      .where(eq(players.twitchId, twitchId))
      .get();
    return (row as PlayerRecord) ?? null;
  }

  /** Get imp by player ID */
  getImpByPlayerId(playerId: number): ImpRecord | null {
    const row = this.db
      .select()
      .from(imps)
      .where(eq(imps.playerId, playerId))
      .get();
    return (row as ImpRecord) ?? null;
  }

  /** Get imp by Twitch ID (convenience) */
  getImpByTwitchId(twitchId: string): ImpRecord | null {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return null;
    return this.getImpByPlayerId(player.id);
  }

  /** Get total number of registered players */
  getTotalPlayerCount(): number {
    const rows = this.db.select({ id: players.id }).from(players).all();
    return rows.length;
  }

  /** Get all player Twitch IDs */
  getAllPlayerTwitchIds(): string[] {
    const rows = this.db
      .select({ twitchId: players.twitchId })
      .from(players)
      .all();
    return rows.map((r) => r.twitchId);
  }

  /** Get keep treasury (gold + materials) */
  getKeepTreasury(): KeepRecord {
    const row = this.db.select().from(keep).get();
    return { gold: row?.gold ?? 0, materials: row?.materials ?? 0 };
  }

  /** Deposit gold and materials to the keep treasury */
  depositToKeep(gold: number, materials: number): void {
    const current = this.getKeepTreasury();
    this.db
      .update(keep)
      .set({
        gold: current.gold + gold,
        materials: current.materials + materials,
      })
      .where(eq(keep.id, 1))
      .run();
  }

  /** Add gold to a player's imp by twitch ID */
  addGoldToImp(twitchId: string, amount: number): void {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return;
    const imp = this.getImpByPlayerId(player.id);
    if (!imp) return;
    this.db
      .update(imps)
      .set({ gold: imp.gold + amount })
      .where(eq(imps.id, imp.id))
      .run();
  }
}
