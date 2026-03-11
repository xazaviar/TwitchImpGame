export type PlayerRole = "viewer" | "follower" | "subscriber" | "admin";

export interface Player {
  id: number;
  twitchId: string;
  twitchUsername: string;
  twitchDisplayName: string;
  role: PlayerRole;
  subTier: number; // 0=none, 1/2/3
  createdAt: Date;
  lastSeenAt: Date;
}

export interface Imp {
  id: number;
  playerId: number;
  name: string;
  appearance: ImpAppearance;
  weapon: WeaponId;
  level: number;
  xp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  skillPoints: number;
  gold: number;
}

export interface ImpAppearance {
  color: string;
  horns: string;
  eyes: string;
  mouth: string;
  nose: string;
  extras: string[];
  cosmetics: string[];
}

export type WeaponId = "sword" | "bow" | "staff" | "cross" | "shield" | (string & {});

/** Max skill slots based on player role */
export function getMaxSkillSlots(role: PlayerRole): number {
  switch (role) {
    case "subscriber":
    case "admin":
      return 3;
    case "follower":
      return 2;
    default:
      return 1;
  }
}
