import type { CombatEncounterDef } from "@imp/shared";

/**
 * All encounters use a static 8×8 grid.
 * Each defines imp spawn positions (left side), enemy spawn positions (via enemies[].positions),
 * and obstacles that block movement + line of sight.
 */

// ─── Goblin Woods (Tier 1) ────────────────────────────────

const goblinWoodsEncounter1: CombatEncounterDef = {
  id: "gw_enc_1",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "goblin_grunt", count: 2, positions: [{ x: 7, y: 2 }, { x: 7, y: 5 }] },
    { enemyId: "goblin_archer", count: 1, positions: [{ x: 6, y: 4 }] },
  ],
  obstacles: [{ x: 3, y: 2 }, { x: 3, y: 5 }, { x: 4, y: 3 }],
  terrain: [],
};

const goblinWoodsEncounter2: CombatEncounterDef = {
  id: "gw_enc_2",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "goblin_grunt", count: 1, positions: [{ x: 7, y: 3 }] },
    { enemyId: "goblin_archer", count: 1, positions: [{ x: 6, y: 6 }] },
    { enemyId: "goblin_shaman", count: 1, positions: [{ x: 6, y: 1 }] },
  ],
  obstacles: [{ x: 4, y: 1 }, { x: 4, y: 6 }, { x: 3, y: 4 }],
  terrain: [],
};

const goblinWoodsBoss: CombatEncounterDef = {
  id: "gw_boss",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "goblin_king", count: 1, positions: [{ x: 7, y: 3 }] },
    { enemyId: "goblin_grunt", count: 2, positions: [{ x: 6, y: 1 }, { x: 6, y: 5 }] },
  ],
  obstacles: [{ x: 3, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 0 }, { x: 3, y: 7 }],
  terrain: [],
};

// ─── Crystal Caves (Tier 2) ───────────────────────────────

const crystalCavesEncounter1: CombatEncounterDef = {
  id: "cc_enc_1",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "crystal_golem", count: 2, positions: [{ x: 7, y: 2 }, { x: 7, y: 5 }] },
    { enemyId: "cave_bat", count: 1, positions: [{ x: 5, y: 3 }] },
  ],
  obstacles: [{ x: 2, y: 3 }, { x: 4, y: 1 }, { x: 4, y: 5 }, { x: 5, y: 6 }],
  terrain: [],
};

const crystalCavesEncounter2: CombatEncounterDef = {
  id: "cc_enc_2",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "crystal_golem", count: 1, positions: [{ x: 7, y: 4 }] },
    { enemyId: "cave_bat", count: 2, positions: [{ x: 5, y: 1 }, { x: 5, y: 6 }] },
    { enemyId: "gem_sprite", count: 1, positions: [{ x: 6, y: 3 }] },
  ],
  obstacles: [{ x: 3, y: 2 }, { x: 3, y: 5 }, { x: 4, y: 3 }, { x: 4, y: 4 }],
  terrain: [],
};

const crystalCavesBoss: CombatEncounterDef = {
  id: "cc_boss",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "crystal_wyrm", count: 1, positions: [{ x: 7, y: 3 }] },
    { enemyId: "crystal_golem", count: 1, positions: [{ x: 6, y: 6 }] },
    { enemyId: "gem_sprite", count: 1, positions: [{ x: 6, y: 1 }] },
  ],
  obstacles: [{ x: 3, y: 1 }, { x: 3, y: 6 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 0 }],
  terrain: [],
};

// ─── Undead Crypt (Tier 3) ────────────────────────────────

const undeadCryptEncounter1: CombatEncounterDef = {
  id: "uc_enc_1",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "skeleton_warrior", count: 2, positions: [{ x: 7, y: 2 }, { x: 7, y: 5 }] },
    { enemyId: "bone_archer", count: 1, positions: [{ x: 6, y: 3 }] },
  ],
  obstacles: [{ x: 3, y: 1 }, { x: 3, y: 6 }, { x: 4, y: 2 }, { x: 4, y: 5 }],
  terrain: [],
};

const undeadCryptEncounter2: CombatEncounterDef = {
  id: "uc_enc_2",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "skeleton_warrior", count: 1, positions: [{ x: 7, y: 4 }] },
    { enemyId: "bone_archer", count: 1, positions: [{ x: 6, y: 1 }] },
    { enemyId: "necromancer", count: 1, positions: [{ x: 6, y: 6 }] },
  ],
  obstacles: [{ x: 2, y: 3 }, { x: 4, y: 2 }, { x: 4, y: 5 }, { x: 5, y: 4 }],
  terrain: [],
};

const undeadCryptBoss: CombatEncounterDef = {
  id: "uc_boss",
  gridSize: { width: 8, height: 8 },
  impSpawnPositions: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
  enemies: [
    { enemyId: "lich_lord", count: 1, positions: [{ x: 7, y: 3 }] },
    { enemyId: "skeleton_warrior", count: 2, positions: [{ x: 6, y: 1 }, { x: 6, y: 5 }] },
    { enemyId: "necromancer", count: 1, positions: [{ x: 6, y: 3 }] },
  ],
  obstacles: [{ x: 3, y: 0 }, { x: 3, y: 7 }, { x: 4, y: 2 }, { x: 4, y: 5 }, { x: 3, y: 4 }],
  terrain: [],
};

// ─── Encounter registry by area ───────────────────────────

export const AREA_ENCOUNTERS: Record<string, {
  regular: CombatEncounterDef[];
  boss: CombatEncounterDef[];
}> = {
  goblin_woods: {
    regular: [goblinWoodsEncounter1, goblinWoodsEncounter2],
    boss: [goblinWoodsBoss],
  },
  crystal_caves: {
    regular: [crystalCavesEncounter1, crystalCavesEncounter2],
    boss: [crystalCavesBoss],
  },
  undead_crypt: {
    regular: [undeadCryptEncounter1, undeadCryptEncounter2],
    boss: [undeadCryptBoss],
  },
};

/** Get a random encounter for an area */
export function getEncounter(areaId: string, isBoss: boolean): CombatEncounterDef | undefined {
  const areaEncounters = AREA_ENCOUNTERS[areaId];
  if (!areaEncounters) return undefined;
  const pool = isBoss ? areaEncounters.boss : areaEncounters.regular;
  return pool[Math.floor(Math.random() * pool.length)];
}
