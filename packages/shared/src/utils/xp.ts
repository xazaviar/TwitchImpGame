import { LEVEL_XP_BASE, LEVEL_XP_SCALE } from "../constants/balance.js";

/** Calculate total XP needed to reach a given level */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += LEVEL_XP_BASE + i * LEVEL_XP_SCALE;
  }
  return total;
}

/** Calculate current level from total XP */
export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= LEVEL_XP_BASE + level * LEVEL_XP_SCALE) {
    remaining -= LEVEL_XP_BASE + level * LEVEL_XP_SCALE;
    level++;
  }
  return level;
}

/** XP progress within current level (0 to 1) */
export function xpProgress(xp: number): number {
  const level = levelFromXp(xp);
  const currentLevelStart = totalXpForLevel(level);
  const nextLevelXp = LEVEL_XP_BASE + level * LEVEL_XP_SCALE;
  return (xp - currentLevelStart) / nextLevelXp;
}
