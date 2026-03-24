import type { GameState, VoteOption, AdventureSummary } from "./game.js";
import type { CombatAction, CombatUnitInfo, GridSize, LootDrop } from "./combat.js";
import type { EventInfo, EventChoice, EventOutcome } from "./events.js";
import type { ImpAppearance, WeaponId } from "./player.js";

/** Events emitted from server to client */
export interface ServerToClientEvents {
  // Game phase
  "game:phase_changed": (state: GameState) => void;
  "game:timer_update": (data: { secondsRemaining: number }) => void;
  "game:adventure_started": (data: { adventureId: number }) => void;
  "game:adventure_ended": (data: { outcome: string; summary: AdventureSummary }) => void;
  "game:announcement": (data: { message: string }) => void;

  // Voting
  "vote:options": (data: { options: VoteOption[]; deadline: number; type: string }) => void;
  "vote:tally_update": (data: { tallies: Record<string, number> }) => void;
  "vote:result": (data: { winnerId: string; winnerName: string }) => void;

  // Combat
  "combat:start": (data: { gridSize: GridSize; units: CombatUnitInfo[] }) => void;
  "combat:actions": (data: { actions: CombatAction[] }) => void;
  "combat:result": (data: { outcome: string; loot: LootDrop }) => void;

  // Events
  "event:presented": (data: { event: EventInfo; choices: EventChoice[] }) => void;
  "event:vote_update": (data: { tallies: Record<string, number> }) => void;
  "event:outcome": (data: { outcome: EventOutcome }) => void;

  // Player-specific
  "player:updated": (data: Record<string, unknown>) => void;
  "player:imp_updated": (data: Record<string, unknown>) => void;
  "player:xp_gained": (data: { amount: number; total: number; leveledUp: boolean }) => void;
  "player:gold_gained": (data: { amount: number; total: number }) => void;
  "player:skill_unlocked": (data: { skillId: string }) => void;

  // Keep
  "keep:updated": (data: { gold: number; materials: number }) => void;
  "keep:upgrade_completed": (data: { upgradeId: string; type: string; level: number }) => void;
  "keep:treasure_earned": (data: { treasureId: string; type: string; name: string }) => void;

  // Error
  "error": (data: { code: string; message: string }) => void;
}

/** Events emitted from client to server */
export interface ClientToServerEvents {
  // Voting
  "vote:cast": (data: { optionId: string }) => void;

  // Player actions
  "player:customize_imp": (data: { appearance: ImpAppearance }) => void;
  "player:equip_weapon": (data: { weapon: WeaponId }) => void;
  "player:learn_skill": (data: { skillId: string; slotIndex: number }) => void;

  // Admin
  "admin:start_adventure": () => void;
  "admin:stop_adventure": () => void;
  "admin:announce": (data: { message: string }) => void;
  "admin:spawn_imp": () => void;
}
