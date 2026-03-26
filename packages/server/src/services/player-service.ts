/**
 * Player & Imp management — database operations for creating/fetching players and imps.
 */
import { eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.js";
import { players, imps, keep, playerStats } from "../db/schema.js";
import { BASE_WEAPONS, computeImpStats } from "@imp/shared";

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
  luck: number;
  fervor: number;
  gold: number;
}

export interface KeepRecord {
  gold: number;
  wood: number;
  stone: number;
  bones: number;
}

export class PlayerService {
  private db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
    this.syncAllImpStats();
  }

  /** Re-derive all imp stats from their weapon on startup (picks up weapon balance changes) */
  private syncAllImpStats(): void {
    const allImps = this.db.select().from(imps).all();
    let updated = 0;
    for (const imp of allImps) {
      const stats = computeImpStats(imp.weapon);
      if (
        imp.maxHp !== stats.maxHp ||
        imp.attack !== stats.attack ||
        imp.defense !== stats.defense ||
        imp.speed !== stats.speed ||
        imp.luck !== stats.luck ||
        imp.fervor !== stats.fervor
      ) {
        this.db
          .update(imps)
          .set({
            maxHp: stats.maxHp,
            attack: stats.attack,
            defense: stats.defense,
            speed: stats.speed,
            luck: stats.luck,
            fervor: stats.fervor,
          })
          .where(eq(imps.id, imp.id))
          .run();
        updated++;
      }
    }
    if (updated > 0) {
      console.log(`[PlayerService] Synced stats for ${updated} imp(s) to match current weapon definitions.`);
    }
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

    // Initialize lifetime stats row
    this.getOrCreateStats(playerId);

    return { player, imp, isNew: true };
  }

  /** Create an imp for a player with a random name and random starting weapon */
  private createImp(playerId: number): ImpRecord {
    const name = this.pickRandomName();
    const weaponId = STARTER_WEAPONS[Math.floor(Math.random() * STARTER_WEAPONS.length)];
    const stats = computeImpStats(weaponId);

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
        maxHp: stats.maxHp,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
        luck: stats.luck,
        fervor: stats.fervor,
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
      maxHp: stats.maxHp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      luck: stats.luck,
      fervor: stats.fervor,
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

  /** Get all imps with their owner's twitchId */
  getAllImpsWithTwitchId(): (ImpRecord & { twitchId: string })[] {
    const rows = this.db
      .select({
        id: imps.id,
        playerId: imps.playerId,
        name: imps.name,
        weapon: imps.weapon,
        level: imps.level,
        xp: imps.xp,
        maxHp: imps.maxHp,
        attack: imps.attack,
        defense: imps.defense,
        speed: imps.speed,
        luck: imps.luck,
        fervor: imps.fervor,
        gold: imps.gold,
        twitchId: players.twitchId,
      })
      .from(imps)
      .innerJoin(players, eq(imps.playerId, players.id))
      .all();
    return rows as (ImpRecord & { twitchId: string })[];
  }

  /** Get all player Twitch IDs */
  getAllPlayerTwitchIds(): string[] {
    const rows = this.db
      .select({ twitchId: players.twitchId })
      .from(players)
      .all();
    return rows.map((r) => r.twitchId);
  }

  /** Get keep treasury (gold + typed materials) */
  getKeepTreasury(): KeepRecord {
    const row = this.db.select().from(keep).get();
    return {
      gold: row?.gold ?? 0,
      wood: row?.wood ?? 0,
      stone: row?.stone ?? 0,
      bones: row?.bones ?? 0,
    };
  }

  /** Add XP to a player's imp by twitch ID. Returns new total (no level-up logic yet). */
  addXpToImp(twitchId: string, amount: number): number {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return 0;
    const imp = this.getImpByPlayerId(player.id);
    if (!imp) return 0;
    const newXp = imp.xp + amount;
    this.db
      .update(imps)
      .set({ xp: newXp })
      .where(eq(imps.id, imp.id))
      .run();
    return newXp;
  }

  /** Batch fetch imps by twitch IDs */
  getImpsByTwitchIds(twitchIds: string[]): Map<string, ImpRecord> {
    const result = new Map<string, ImpRecord>();
    for (const twitchId of twitchIds) {
      const imp = this.getImpByTwitchId(twitchId);
      if (imp) result.set(twitchId, imp);
    }
    return result;
  }

  /** Deposit gold and typed materials to the keep treasury */
  depositToKeep(gold: number, materials: { wood: number; stone: number; bones: number }): void {
    const current = this.getKeepTreasury();
    this.db
      .update(keep)
      .set({
        gold: current.gold + gold,
        wood: current.wood + materials.wood,
        stone: current.stone + materials.stone,
        bones: current.bones + materials.bones,
      })
      .where(eq(keep.id, 1))
      .run();
  }

  /** Add gold to a player's imp by twitch ID. Returns new total gold. */
  addGoldToImp(twitchId: string, amount: number): number {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return 0;
    const imp = this.getImpByPlayerId(player.id);
    if (!imp) return 0;
    const newGold = imp.gold + amount;
    this.db
      .update(imps)
      .set({ gold: newGold })
      .where(eq(imps.id, imp.id))
      .run();
    return newGold;
  }

  // ─── Player Stats ─────────────────────────────────────────

  /** Ensure a player_stats row exists for this player */
  getOrCreateStats(playerId: number): void {
    const existing = this.db
      .select({ id: playerStats.id })
      .from(playerStats)
      .where(eq(playerStats.playerId, playerId))
      .get();
    if (!existing) {
      this.db.insert(playerStats).values({ playerId }).run();
    }
  }

  /** Increment numeric stat fields for a player */
  incrementStats(
    twitchId: string,
    deltas: Partial<{
      totalKills: number;
      totalAdventures: number;
      totalDamageDealt: number;
      totalGoldEarned: number;
      totalHealingDone: number;
      successfulAdventures: number;
      totalDeaths: number;
      totalDamageTaken: number;
      totalAssists: number;
      combatsParticipated: number;
      totalCrits: number;
    }>
  ): void {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return;
    this.getOrCreateStats(player.id);

    // Build Drizzle update object using sql`col + N` for atomic increment
    const updates: Record<string, ReturnType<typeof sql>> = {};
    const colMap: Record<string, keyof typeof playerStats.$inferSelect> = {
      totalKills: "totalKills",
      totalAdventures: "totalAdventures",
      totalDamageDealt: "totalDamageDealt",
      totalGoldEarned: "totalGoldEarned",
      totalHealingDone: "totalHealingDone",
      successfulAdventures: "successfulAdventures",
      totalDeaths: "totalDeaths",
      totalDamageTaken: "totalDamageTaken",
      totalAssists: "totalAssists",
      combatsParticipated: "combatsParticipated",
      totalCrits: "totalCrits",
    };

    for (const [key, val] of Object.entries(deltas)) {
      if (val && val > 0 && key in colMap) {
        const colName = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
        updates[colMap[key as keyof typeof colMap]] = sql`${sql.raw(colName)} + ${val}`;
      }
    }
    if (Object.keys(updates).length === 0) return;

    this.db
      .update(playerStats)
      .set(updates as any)
      .where(eq(playerStats.playerId, player.id))
      .run();
  }

  /** Update highest single-hit damage if the new value is higher */
  updateHighestDamage(twitchId: string, damage: number): void {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return;
    this.getOrCreateStats(player.id);

    this.db
      .update(playerStats)
      .set({
        highestDamageSingleHit: sql`MAX(highest_damage_single_hit, ${damage})`,
      } as any)
      .where(eq(playerStats.playerId, player.id))
      .run();
  }

  /** Add damage to the per-weapon breakdown JSON */
  addDamageByWeapon(twitchId: string, weaponId: string, damage: number): void {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return;
    this.getOrCreateStats(player.id);

    const row = this.db
      .select({ data: playerStats.totalDamageByWeapon })
      .from(playerStats)
      .where(eq(playerStats.playerId, player.id))
      .get();

    const raw = row?.data;
    const weaponDamage: Record<string, number> = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, number>) ?? {};
    weaponDamage[weaponId] = (weaponDamage[weaponId] ?? 0) + damage;

    this.db
      .update(playerStats)
      .set({ totalDamageByWeapon: weaponDamage as any })
      .where(eq(playerStats.playerId, player.id))
      .run();
  }

  /** Add kills to the per-enemy-type breakdown JSON */
  addKillsByEnemyType(twitchId: string, enemyId: string, count: number): void {
    const player = this.getPlayerByTwitchId(twitchId);
    if (!player) return;
    this.getOrCreateStats(player.id);

    const row = this.db
      .select({ data: playerStats.enemiesKilledByType })
      .from(playerStats)
      .where(eq(playerStats.playerId, player.id))
      .get();

    const raw = row?.data;
    const killsByType: Record<string, number> = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, number>) ?? {};
    killsByType[enemyId] = (killsByType[enemyId] ?? 0) + count;

    this.db
      .update(playerStats)
      .set({ enemiesKilledByType: killsByType as any })
      .where(eq(playerStats.playerId, player.id))
      .run();
  }
}
