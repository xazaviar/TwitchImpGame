import type { WeaponId } from "../types/player.js";

export interface StatBlock {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
  fervor: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  description: string;
  range: number;
  minRange: number;
  requiresLineOfSight: boolean;
  damageType: "physical" | "magic";
  /** Staff-style AoE: hits orthogonal tiles adjacent to target at half damage */
  aoeType?: "splash_orthogonal";
  statModifiers: StatBlock;
  isBase: boolean; // true for the 5 starter weapons
}

/** Base stats for all imps before weapon modifiers */
export const IMP_BASE_STATS: StatBlock = {
  maxHp: 12,
  attack: 3,
  defense: 0,
  speed: 3,
  luck: 1,
  fervor: 3,
};

export const BASE_WEAPONS: Record<string, WeaponDefinition> = {
  sword: {
    id: "sword",
    name: "Sword",
    description: "Balanced melee weapon. Reliable damage up close.",
    range: 1,
    minRange: 1,
    requiresLineOfSight: false,
    damageType: "physical",
    statModifiers: { maxHp: 0, attack: 2, defense: 0, speed: 0, luck: 0, fervor: -1 },
    isBase: true,
  },
  bow: {
    id: "bow",
    name: "Bow",
    description: "Ranged weapon. Attacks from a distance but fragile.",
    range: 5,
    minRange: 2,
    requiresLineOfSight: false,
    damageType: "physical",
    statModifiers: { maxHp: -2, attack: 2, defense: 0, speed: -1, luck: 1, fervor: 0 },
    isBase: true,
  },
  staff: {
    id: "staff",
    name: "Staff",
    description: "Magical ranged weapon. High fervor, low survivability. Splash damages adjacent units.",
    range: 3,
    minRange: 1,
    requiresLineOfSight: true,
    damageType: "magic",
    aoeType: "splash_orthogonal",
    statModifiers: { maxHp: -2, attack: 1, defense: 0, speed: 0, luck: 0, fervor: 2 },
    isBase: true,
  },
  cross: {
    id: "cross",
    name: "Cross",
    description: "Heals allies; attacks with magic when no healing needed.",
    range: 2,
    minRange: 1,
    requiresLineOfSight: true,
    damageType: "magic",
    statModifiers: { maxHp: 0, attack: 0, defense: 1, speed: 0, luck: 0, fervor: 1 },
    isBase: true,
  },
  shield: {
    id: "shield",
    name: "Shield",
    description: "Tanky melee. High defense, draws enemy attention.",
    range: 1,
    minRange: 1,
    requiresLineOfSight: false,
    damageType: "physical",
    statModifiers: { maxHp: 15, attack: 0, defense: 2, speed: 0, luck: 0, fervor: -1 },
    isBase: true,
  },
};

/** Compute final stats for a weapon by adding modifiers to base stats */
export function computeImpStats(weaponId: string): StatBlock {
  const weapon = BASE_WEAPONS[weaponId];
  const mods = weapon?.statModifiers ?? { maxHp: 0, attack: 0, defense: 0, speed: 0, luck: 0, fervor: 0 };
  return {
    maxHp: IMP_BASE_STATS.maxHp + mods.maxHp,
    attack: IMP_BASE_STATS.attack + mods.attack,
    defense: IMP_BASE_STATS.defense + mods.defense,
    speed: IMP_BASE_STATS.speed + mods.speed,
    luck: IMP_BASE_STATS.luck + mods.luck,
    fervor: IMP_BASE_STATS.fervor + mods.fervor,
  };
}
