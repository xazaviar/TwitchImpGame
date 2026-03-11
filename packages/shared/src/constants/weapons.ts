import type { WeaponId } from "../types/player.js";

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  description: string;
  attackRange: number;
  baseStats: {
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
  };
  targeting: "nearest_enemy" | "lowest_hp_ally" | "nearest_enemy"; // AI behavior
  isBase: boolean; // true for the 5 starter weapons
}

export const BASE_WEAPONS: Record<string, WeaponDefinition> = {
  sword: {
    id: "sword",
    name: "Sword",
    description: "Balanced melee weapon. Reliable damage up close.",
    attackRange: 1,
    baseStats: { maxHp: 20, attack: 7, defense: 4, speed: 5 },
    targeting: "nearest_enemy",
    isBase: true,
  },
  bow: {
    id: "bow",
    name: "Bow",
    description: "Ranged weapon. Attacks from a distance but fragile.",
    attackRange: 3,
    baseStats: { maxHp: 15, attack: 8, defense: 2, speed: 6 },
    targeting: "nearest_enemy",
    isBase: true,
  },
  staff: {
    id: "staff",
    name: "Staff",
    description: "Magical ranged weapon. High damage, low survivability.",
    attackRange: 2,
    baseStats: { maxHp: 14, attack: 9, defense: 2, speed: 4 },
    targeting: "nearest_enemy",
    isBase: true,
  },
  cross: {
    id: "cross",
    name: "Cross",
    description: "Heals allies instead of attacking enemies.",
    attackRange: 2,
    baseStats: { maxHp: 18, attack: 4, defense: 3, speed: 5 },
    targeting: "lowest_hp_ally",
    isBase: true,
  },
  shield: {
    id: "shield",
    name: "Shield",
    description: "Tanky melee. High defense, draws enemy attention.",
    attackRange: 1,
    baseStats: { maxHp: 28, attack: 4, defense: 8, speed: 3 },
    targeting: "nearest_enemy",
    isBase: true,
  },
};
