import type { WeaponId } from "./player.js";

export interface GridPosition {
  x: number;
  y: number;
}

export interface GridSize {
  width: number;
  height: number;
}

export interface CombatUnit {
  id: string;
  name: string;
  isImp: boolean;
  weapon?: WeaponId; // Only for imps
  enemyId?: string; // Only for enemies
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
  fervor: number;
  position: GridPosition;
}

export interface CombatUnitInfo {
  id: string;
  name: string;
  isImp: boolean;
  weapon?: WeaponId;
  enemyId?: string;
  hp: number;
  maxHp: number;
  fervor: number; // fervor gain rate per turn
  position: GridPosition;
}

export type CombatActionType =
  | "move"
  | "attack"
  | "heal"
  | "ability"
  | "eject"
  | "reinforce"
  | "death";

export interface CombatAction {
  turn: number;
  actorId: string;
  type: CombatActionType;
  from?: GridPosition;
  to?: GridPosition;
  targetId?: string;
  damage?: number;
  healing?: number;
  newHp?: number;
  isCrit?: boolean; // true if this attack was a critical hit
  actorFervor?: number; // actor's current fervor after this action
  replacementId?: string;
  replacementName?: string;
}

import type { Materials } from "./game.js";

export interface LootDrop {
  gold: number;
  materials: Materials;
  specialItems: string[];
}

export interface CombatResult {
  actions: CombatAction[];
  gridSize: GridSize;
  initialPositions: Record<string, GridPosition>;
  initialUnits: CombatUnitInfo[];
  totalRounds: number;
  outcome: "victory" | "defeat";
  loot: LootDrop;
  xpAwarded: Record<string, number>;
  ejectedImpIds: string[];
  killCredit: Record<string, string[]>;
  assists: Record<string, number>;
  heals: Record<string, number>;
  participants: string[];
  survivingImpIds: string[];
}
