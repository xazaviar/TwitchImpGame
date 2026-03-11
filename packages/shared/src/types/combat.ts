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
  replacementId?: string;
  replacementName?: string;
}

export interface LootDrop {
  gold: number;
  materials: number;
  specialItems: string[];
}

export interface CombatResult {
  actions: CombatAction[];
  gridSize: GridSize;
  initialPositions: Record<string, GridPosition>;
  totalTurns: number;
  outcome: "victory" | "defeat";
  loot: LootDrop;
  xpAwarded: Record<string, number>;
  ejectedImpIds: string[];
}
