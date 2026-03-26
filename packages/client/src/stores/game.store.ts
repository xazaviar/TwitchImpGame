import { create } from "zustand";
import type {
  GameState,
  VoteOption,
  AdventureSummary,
  CombatUnitInfo,
  GridPosition,
  GridSize,
  LootDrop,
  EventInfo,
  EventOutcome,
  CombatAction,
} from "@imp/shared";

export type NotificationType = "gold" | "xp" | "level_up" | "skill" | "item";

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  timestamp: number;
}

export interface ImpData {
  id: number;
  name: string;
  weapon: string;
  level: number;
  xp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
  fervor: number;
  gold: number;
}

interface GameStore {
  // Core game state
  gameState: GameState;
  setGameState: (state: GameState) => void;

  // Extended state
  totalPlayers: number;
  adventureCount: number;
  keepCount: number;
  nextAdventureTime: number;
  keepGold: number;
  keepWood: number;
  keepStone: number;
  keepBones: number;
  setExtendedState: (data: {
    totalPlayers: number;
    adventureCount: number;
    keepCount: number;
    nextAdventureTime: number;
    keepGold?: number;
    keepWood?: number;
    keepStone?: number;
    keepBones?: number;
  }) => void;

  // Player's imp
  myImp: ImpData | null;
  setMyImp: (imp: ImpData | null) => void;

  // Player's current vote
  myVote: string | null;
  setMyVote: (vote: string | null) => void;

  // Timer
  secondsRemaining: number;
  setSecondsRemaining: (s: number) => void;

  // Voting
  voteOptions: VoteOption[];
  voteTallies: Record<string, number>;
  voteDeadline: number;
  voteType: string;
  voteResult: { winnerId: string; winnerName: string } | null;
  setVoteOptions: (options: VoteOption[], deadline: number, type: string) => void;
  setVoteTallies: (tallies: Record<string, number>) => void;
  setVoteResult: (result: { winnerId: string; winnerName: string } | null) => void;

  // Combat
  combatGrid: GridSize | null;
  combatUnits: CombatUnitInfo[];
  combatActiveCount: number;
  combatActions: CombatAction[];
  combatObstacles: GridPosition[];
  combatOutcome: string | null;
  combatLoot: LootDrop | null;
  /** Outcome/loot received from server but not yet shown (waiting for playback to finish) */
  _pendingOutcome: string | null;
  _pendingLoot: LootDrop | null;
  setCombatStart: (gridSize: GridSize, units: CombatUnitInfo[], activeCount: number, obstacles: GridPosition[]) => void;
  setCombatActions: (actions: CombatAction[], outcome?: string, loot?: LootDrop) => void;
  setCombatResult: (outcome: string, loot: LootDrop) => void;
  /** Called by CombatPlayback when playback finishes — reveals the pending outcome/loot */
  showCombatResult: () => void;
  clearCombat: () => void;

  // Events
  currentEvent: EventInfo | null;
  eventTallies: Record<string, number>;
  eventOutcome: EventOutcome | null;
  setCurrentEvent: (event: EventInfo | null) => void;
  setEventTallies: (tallies: Record<string, number>) => void;
  setEventOutcome: (outcome: EventOutcome | null) => void;

  // Announcements
  announcements: string[];
  addAnnouncement: (message: string) => void;

  // Adventure summary
  adventureSummary: AdventureSummary | null;
  setAdventureSummary: (summary: AdventureSummary | null) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (message: string, type: NotificationType) => void;
  removeNotification: (id: string) => void;

  // Queue & HP tracking
  queuePosition: number | "combat" | "dead" | null;
  impCurrentHp: number | null;
  impMaxHp: number | null;
  impCurrentFervor: number | null;
  allImpHp: Record<string, number>;
  /** The last full queue snapshot from the server (used for local recomputation) */
  serverQueue: Record<string, number | "combat" | "dead">;
  /** Imp details from server (name, level, weapon) keyed by imp ID */
  queueImpDetails: Record<string, { name: string; level: number; weapon: string }>;
  setQueueUpdate: (queue: Record<string, number | "combat" | "dead">, impHp: Record<string, number>, impDetails: Record<string, { name: string; level: number; weapon: string }>, myTwitchId: string | null) => void;
  /** Update live combat state for player's imp during playback */
  setCombatLiveState: (hp: number, fervor: number) => void;
  /** Mark the player's imp as dead during playback */
  setImpPlaybackDead: () => void;
  /** Locally recompute queue: mark combat casualties as dead, promote reinforcements to combat, shift queue numbers down */
  applyCombatQueueDelta: (deadImpIds: string[], reinforcedImpIds: string[], myTwitchId: string | null) => void;
  clearQueueState: () => void;

  // Clear transient phase data on phase change
  clearPhaseData: () => void;
}

const MAX_ANNOUNCEMENTS = 20;

export const useGameStore = create<GameStore>((set) => ({
  // Core
  gameState: { phase: "keep", keepState: { impsAtKeep: 0 } },
  setGameState: (state) => set({ gameState: state }),

  // Extended
  totalPlayers: 0,
  adventureCount: 0,
  keepCount: 0,
  nextAdventureTime: 0,
  keepGold: 0,
  keepWood: 0,
  keepStone: 0,
  keepBones: 0,
  setExtendedState: (data) =>
    set({
      totalPlayers: data.totalPlayers,
      adventureCount: data.adventureCount,
      keepCount: data.keepCount,
      nextAdventureTime: data.nextAdventureTime,
      ...(data.keepGold !== undefined ? { keepGold: data.keepGold } : {}),
      ...(data.keepWood !== undefined ? { keepWood: data.keepWood } : {}),
      ...(data.keepStone !== undefined ? { keepStone: data.keepStone } : {}),
      ...(data.keepBones !== undefined ? { keepBones: data.keepBones } : {}),
    }),

  // Player's imp
  myImp: null,
  setMyImp: (imp) => set({ myImp: imp }),

  // Player's current vote
  myVote: null,
  setMyVote: (vote) => set({ myVote: vote }),

  // Timer
  secondsRemaining: 0,
  setSecondsRemaining: (s) => set({ secondsRemaining: s }),

  // Voting
  voteOptions: [],
  voteTallies: {},
  voteDeadline: 0,
  voteType: "",
  voteResult: null,
  setVoteOptions: (options, deadline, type) =>
    set({ voteOptions: options, voteDeadline: deadline, voteType: type, voteTallies: {}, voteResult: null, myVote: null }),
  setVoteTallies: (tallies) => set({ voteTallies: tallies }),
  setVoteResult: (result) => set({ voteResult: result }),

  // Combat
  combatGrid: null,
  combatUnits: [],
  combatActiveCount: 0,
  combatActions: [],
  combatObstacles: [],
  combatOutcome: null,
  combatLoot: null,
  _pendingOutcome: null,
  _pendingLoot: null,
  setCombatStart: (gridSize, units, activeCount, obstacles) =>
    set({ combatGrid: gridSize, combatUnits: units, combatActiveCount: activeCount, combatObstacles: obstacles, combatActions: [], combatOutcome: null, combatLoot: null, _pendingOutcome: null, _pendingLoot: null }),
  setCombatActions: (actions, outcome, loot) => set({
    combatActions: actions,
    // Store outcome/loot as pending — revealed after playback finishes
    ...(outcome ? { _pendingOutcome: outcome } : {}),
    ...(loot ? { _pendingLoot: loot } : {}),
  }),
  setCombatResult: (outcome, loot) => set({ combatOutcome: outcome, combatLoot: loot }),
  showCombatResult: () => set((state) => ({
    combatOutcome: state._pendingOutcome,
    combatLoot: state._pendingLoot,
  })),
  clearCombat: () => set({ combatGrid: null, combatUnits: [], combatActiveCount: 0, combatActions: [], combatObstacles: [], combatOutcome: null, combatLoot: null, _pendingOutcome: null, _pendingLoot: null }),

  // Events
  currentEvent: null,
  eventTallies: {},
  eventOutcome: null,
  setCurrentEvent: (event) => set({ currentEvent: event, eventTallies: {}, eventOutcome: null }),
  setEventTallies: (tallies) => set({ eventTallies: tallies }),
  setEventOutcome: (outcome) => set({ eventOutcome: outcome }),

  // Announcements
  announcements: [],
  addAnnouncement: (message) =>
    set((state) => ({
      announcements: [...state.announcements.slice(-(MAX_ANNOUNCEMENTS - 1)), message],
    })),

  // Adventure summary
  adventureSummary: null,
  setAdventureSummary: (summary) => set({ adventureSummary: summary }),

  // Notifications
  notifications: [],
  addNotification: (message, type) =>
    set((state) => {
      const notification: Notification = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        message,
        type,
        timestamp: Date.now(),
      };
      // Max 10, drop oldest
      const updated = [...state.notifications, notification].slice(-10);
      return { notifications: updated };
    }),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Queue & HP tracking
  queuePosition: null,
  impCurrentHp: null,
  impMaxHp: null,
  impCurrentFervor: null,
  allImpHp: {},
  serverQueue: {},
  queueImpDetails: {},
  setQueueUpdate: (queue, impHp, impDetails, myTwitchId) =>
    set({
      serverQueue: { ...queue },
      allImpHp: impHp,
      queueImpDetails: impDetails,
      ...(myTwitchId ? {
        queuePosition: queue[myTwitchId] ?? null,
        impCurrentHp: impHp[myTwitchId] ?? null,
      } : {}),
    }),
  setCombatLiveState: (hp, fervor) =>
    set({ impCurrentHp: hp, impCurrentFervor: fervor }),
  setImpPlaybackDead: () =>
    set({ queuePosition: "dead" }),
  applyCombatQueueDelta: (deadImpIds, reinforcedImpIds, myTwitchId) =>
    set((state) => {
      // Start from last known queue
      const q = { ...state.serverQueue };

      // Mark dead imps
      for (const id of deadImpIds) {
        q[id] = "dead";
      }

      // Mark reinforced imps as "combat" (they just entered the fight)
      for (const id of reinforcedImpIds) {
        q[id] = "combat";
      }

      // Recompute queue numbers: only count non-combat, non-dead entries
      // Collect entries that are waiting (number type), sort by their original number, re-assign from 1
      const waiting: { id: string; origPos: number }[] = [];
      for (const [id, val] of Object.entries(q)) {
        if (typeof val === "number") {
          waiting.push({ id, origPos: val });
        }
      }
      waiting.sort((a, b) => a.origPos - b.origPos);
      for (let i = 0; i < waiting.length; i++) {
        q[waiting[i].id] = i + 1;
      }

      return {
        serverQueue: q,
        ...(myTwitchId ? { queuePosition: q[myTwitchId] ?? null } : {}),
      };
    }),
  clearQueueState: () =>
    set({ queuePosition: null, impCurrentHp: null, impMaxHp: null, impCurrentFervor: null, allImpHp: {}, serverQueue: {} }),

  // Clear all transient data when phase changes
  clearPhaseData: () =>
    set({
      voteOptions: [],
      voteTallies: {},
      voteResult: null,
      voteType: "",
      myVote: null,
      combatGrid: null,
      combatUnits: [],
      combatActions: [],
      combatObstacles: [],
      combatOutcome: null,
      combatLoot: null,
      _pendingOutcome: null,
      _pendingLoot: null,
      impCurrentFervor: null,
      currentEvent: null,
      eventTallies: {},
      eventOutcome: null,
    }),
}));
