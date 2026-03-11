import type { GridSize, GridPosition } from "./combat.js";
import type { WeaponId } from "./player.js";

export interface AreaDefinition {
  id: string;
  name: string;
  description: string;
  tier: number;
  travelDuration: number; // ms
  travelNarrative: string;
  combatEncounters: CombatEncounterDef[];
  bosses: CombatEncounterDef[];
  events: string[]; // general event IDs
  areaSpecificEvents: string[];
  lootTable: LootTableDef;
  generalSkillUnlock: string;
  weaponSkillUnlocks: Record<WeaponId, string>;
  completionTreasure: AreaTreasureDef;
}

export interface CombatEncounterDef {
  id: string;
  gridSize: GridSize;
  enemies: EnemyPlacementDef[];
  terrain: TerrainDef[];
}

export interface EnemyPlacementDef {
  enemyId: string;
  count: number;
  positions: GridPosition[] | "random";
}

export interface TerrainDef {
  type: string;
  position: GridPosition;
}

export interface LootTableDef {
  goldRange: { min: number; max: number };
  materialsRange: { min: number; max: number };
  bossGoldMultiplier: number;
  specialItems: string[];
}

export interface AreaTreasureDef {
  treasureId: string;
  name: string;
  description: string;
  tiers: TreasureTierDef[];
}

export interface TreasureTierDef {
  tier: number;
  effect: Record<string, unknown>;
}

export type EnemyAIType =
  | "melee_aggressive"
  | "ranged_kite"
  | "support_heal"
  | "boss_custom";

export interface EnemyAbilityDef {
  id: string;
  range: number;
  effect: string;
  chance?: number;
  cooldown?: number;
  params?: Record<string, unknown>;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  attackRange: number;
  aiType: EnemyAIType;
  abilities: EnemyAbilityDef[];
  spriteKey: string;
  isBoss?: boolean;
}

export type EventOutcomeType = "luck" | "guaranteed" | "skill_check";

export interface EventOutcomeDef {
  type: EventOutcomeType;
  successChance?: number;
  checkType?: string;
  stat?: string;
  threshold?: number;
  requiredWeapon?: WeaponId;
  success: EventResultDef;
  failure?: EventResultDef;
}

export interface EventResultDef {
  narrative: string;
  rewards?: {
    gold?: number;
    materials?: number;
    healAll?: number;
  };
  penalties?: {
    damageToAll?: number;
    damageToRandom?: number;
  };
  cost?: {
    gold?: number;
  };
}

export interface EventChoiceDef {
  id: string;
  label: string;
  outcome: EventOutcomeDef;
}

export interface EventDefinition {
  id: string;
  name: string;
  description: string;
  type: "choice";
  choices: EventChoiceDef[];
}
