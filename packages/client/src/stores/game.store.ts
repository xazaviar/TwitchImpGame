import { create } from "zustand";
import type {
  GameState,
  VoteOption,
  AdventureSummary,
  CombatUnitInfo,
  GridSize,
  LootDrop,
  EventInfo,
  EventOutcome,
} from "@imp/shared";

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
  keepMaterials: number;
  setExtendedState: (data: {
    totalPlayers: number;
    adventureCount: number;
    keepCount: number;
    nextAdventureTime: number;
    keepGold?: number;
    keepMaterials?: number;
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
  combatOutcome: string | null;
  combatLoot: LootDrop | null;
  setCombatStart: (gridSize: GridSize, units: CombatUnitInfo[]) => void;
  setCombatResult: (outcome: string, loot: LootDrop) => void;
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
  keepMaterials: 0,
  setExtendedState: (data) =>
    set({
      totalPlayers: data.totalPlayers,
      adventureCount: data.adventureCount,
      keepCount: data.keepCount,
      nextAdventureTime: data.nextAdventureTime,
      ...(data.keepGold !== undefined ? { keepGold: data.keepGold } : {}),
      ...(data.keepMaterials !== undefined ? { keepMaterials: data.keepMaterials } : {}),
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
  combatOutcome: null,
  combatLoot: null,
  setCombatStart: (gridSize, units) =>
    set({ combatGrid: gridSize, combatUnits: units, combatOutcome: null, combatLoot: null }),
  setCombatResult: (outcome, loot) => set({ combatOutcome: outcome, combatLoot: loot }),
  clearCombat: () => set({ combatGrid: null, combatUnits: [], combatOutcome: null, combatLoot: null }),

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
      combatOutcome: null,
      combatLoot: null,
      currentEvent: null,
      eventTallies: {},
      eventOutcome: null,
    }),
}));
