import type { WeaponId } from "./player.js";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  areaId: string;
  requiredWeapon: WeaponId | null; // null = general skill (any weapon)
  cost: number; // skill points to learn
  effect: SkillEffect;
}

export type SkillEffect =
  | { kind: "stat_bonus"; stat: "maxHp" | "attack" | "defense" | "speed"; value: number }
  | { kind: "passive"; passive: string; params?: Record<string, number> };

export interface LearnedSkill {
  skillId: string;
  slotIndex: number;
}

export interface UnlockedSkill {
  skillId: string;
}
