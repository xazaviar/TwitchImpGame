export interface KeepState {
  gold: number;
  wood: number;
  stone: number;
  bones: number;
}

export type UpgradeType = "walls" | "armory" | "ballista" | "barracks" | "treasury";

export interface KeepUpgrade {
  upgradeId: string;
  upgradeType: UpgradeType;
  level: number;
}

export type TreasureType = "passive_bonus" | "weapon_unlock" | "cosmetic_trophy" | "other";

export interface KeepTreasure {
  id: number;
  treasureId: string;
  areaId: string;
  adventureId: number;
  tier: number;
  type: TreasureType;
  effect: TreasureEffect;
  acquiredAt: Date;
}

export type TreasureEffect =
  | { kind: "gold_bonus"; percentBonus: number }
  | { kind: "weapon_unlock"; weaponId: string; weaponName: string }
  | { kind: "cosmetic"; cosmeticId: string; cosmeticName: string }
  | { kind: "stat_bonus"; stat: string; value: number }
  | { kind: "custom"; description: string };
