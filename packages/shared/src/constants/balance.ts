/** Game balance constants */

// XP — Combat
export const XP_PER_ENEMY_KILL = 1; // killing blow
export const XP_PER_COMBAT_PARTICIPATION = 1; // selected for combat (even if ejected)
export const XP_PER_ASSIST_THRESHOLD = 3; // 1 XP per this many assists
export const XP_PER_HEAL_THRESHOLD = 2; // 1 XP per this many heals
export const XP_PER_COMBAT_STEP_SUCCESS = 1; // all surviving imps on victory (even non-participants)
export const XP_PER_BOSS_SURVIVE = 3; // surviving, participating imps only
export const XP_PER_ADVENTURE_SUCCESS = 3; // surviving imps on successful return

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
export const MAX_COMBAT_ROUNDS = 50; // rounds (each unit acts once per round)
export const CRIT_CHANCE_PER_LUCK = 0.05; // 1 LCK = 5% crit chance
export const SPECIAL_ACTION_THRESHOLD = 10; // FRV accumulator triggers at 10
export const TAUNT_DISTANCE_MULTIPLIER = 0.33; // shield imps appear 3× closer to enemies

// Combat playback — per-action-type durations (ms)
export const ACTION_DURATION: Record<string, number> = {
  move: 300,
  attack: 500,
  heal: 500,
  death: 800,
  eject: 600,
  reinforce: 700,
  ability: 600,
};
export const ACTION_DURATION_DEFAULT = 400;

/** Initial pause before playback starts (lets players see the grid) */
export const COMBAT_PLAYBACK_INITIAL_DELAY_MS = 500;

/** Pause after last action before showing outcome banner */
export const COMBAT_PLAYBACK_POST_ACTION_DELAY_MS = 600;

/** Time the outcome banner (VICTORY / DEFEAT) is displayed before server moves on */
export const COMBAT_RESULT_DISPLAY_MS = 3000;

/** Network buffer added to server wait time */
export const COMBAT_NETWORK_BUFFER_MS = 1500;

/** Compute total playback duration for a set of actions (used by both client and server) */
export function computePlaybackDuration(actions: { type: string }[]): number {
  let total = COMBAT_PLAYBACK_INITIAL_DELAY_MS;
  for (const a of actions) {
    total += ACTION_DURATION[a.type] ?? ACTION_DURATION_DEFAULT;
  }
  total += COMBAT_PLAYBACK_POST_ACTION_DELAY_MS;
  return total;
}

// Voting
export const LOCATION_VOTE_DURATION_MS = 5_000; // 5 seconds (testing)
export const EVENT_VOTE_DURATION_MS = 5_000; // 5 seconds (testing)
export const POST_BOSS_VOTE_DURATION_MS = 5_000; // 5 seconds (testing)

// Keep phase
export const IDLE_AUTO_ADVENTURE_MS = 600_000; // 10 minutes

// Travel
export const DEFAULT_TRAVEL_DURATION_MS = 5_000; // 5 seconds

// Tier system — escalating difficulty when continuing after boss
export const MAX_TIER = 3;
export const TIER_REWARD_MULTIPLIERS = [1, 1.5, 2]; // index = tier - 1
export const TIER_ENEMY_HP_MULTIPLIERS = [1, 1.3, 1.8];
export const TIER_ENEMY_ATK_MULTIPLIERS = [1, 1.3, 1.8];

/** Get the adventure tier (1-based) from number of areas completed */
export function getTier(totalAreasCompleted: number): number {
  return Math.min(totalAreasCompleted + 1, MAX_TIER);
}
