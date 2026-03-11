import { create } from "zustand";
import type { GameState } from "@imp/shared";

interface GameStore {
  gameState: GameState;
  setGameState: (state: GameState) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: { phase: "keep", keepState: { impsAtKeep: 0 } },
  setGameState: (state) => set({ gameState: state }),
}));
