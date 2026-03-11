export type GamePhase =
  | "keep"
  | "voting"
  | "traveling"
  | "combat"
  | "event"
  | "boss"
  | "post_boss"
  | "returning";

export interface KeepPhaseState {
  impsAtKeep: number;
}

export interface VotingPhaseState {
  options: VoteOption[];
  tallies: Record<string, number>;
  deadline: number; // Unix timestamp ms
  type: "location" | "event" | "post_boss";
}

export interface VoteOption {
  id: string;
  name: string;
  description: string;
}

export interface TravelPhaseState {
  destination: string;
  arrivalTime: number; // Unix timestamp ms
}

export interface AdventureState {
  adventureId: number;
  currentAreaId: string;
  currentStep: number; // 1-5 within an area
  totalAreasCompleted: number;
  survivingImpCount: number;
  lootPool: LootPool;
}

export interface LootPool {
  gold: number;
  materials: number;
  specialItems: string[];
}

export type GameState =
  | { phase: "keep"; keepState: KeepPhaseState }
  | { phase: "voting"; votingState: VotingPhaseState; adventure?: AdventureState }
  | { phase: "traveling"; travelState: TravelPhaseState; adventure: AdventureState }
  | { phase: "combat"; adventure: AdventureState }
  | { phase: "event"; adventure: AdventureState }
  | { phase: "boss"; adventure: AdventureState }
  | { phase: "post_boss"; adventure: AdventureState }
  | { phase: "returning"; adventure: AdventureState };

export interface AdventureSummary {
  adventureId: number;
  outcome: "success" | "failure" | "abandoned";
  areasVisited: string[];
  areasCompleted: number;
  totalSteps: number;
  participantCount: number;
  goldCollected: number;
  materialsCollected: number;
}
