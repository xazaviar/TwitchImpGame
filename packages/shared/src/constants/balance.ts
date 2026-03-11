/** Game balance constants */

// XP
export const XP_PER_ADVENTURE_STEP = 1;
export const XP_PER_ENEMY_KILL = 1;
export const XP_PER_BOSS_SURVIVE = 3;

// Leveling: XP needed = BASE + (level * SCALE)
export const LEVEL_XP_BASE = 10;
export const LEVEL_XP_SCALE = 5;

export function xpRequiredForLevel(level: number): number {
  return LEVEL_XP_BASE + level * LEVEL_XP_SCALE;
}

// Gold split
export const KEEP_GOLD_PERCENTAGE = 0.95;
export const IMP_GOLD_PERCENTAGE = 0.05;

// Skill reset cost (gold)
export const SKILL_RESET_BASE_COST = 50;

// Combat
export const MAX_IMPS_PER_COMBAT = 5;
export const MAX_COMBAT_TURNS = 100;

// Voting
export const LOCATION_VOTE_DURATION_MS = 60_000; // 1 minute
export const EVENT_VOTE_DURATION_MS = 30_000; // 30 seconds
export const POST_BOSS_VOTE_DURATION_MS = 45_000; // 45 seconds

// Keep phase
export const IDLE_AUTO_ADVENTURE_MS = 600_000; // 10 minutes

// Travel
export const DEFAULT_TRAVEL_DURATION_MS = 5_000; // 5 seconds

// Push-your-luck reward multipliers per additional area
export const REWARD_TIER_MULTIPLIER = 1.5;
