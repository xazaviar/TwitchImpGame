import { useEffect } from "react";
import { useSocket } from "./useSocket.js";
import { useGameStore } from "../stores/game.store.js";

export function useGameState() {
  const { socket } = useSocket();
  const setGameState = useGameStore((s) => s.setGameState);
  const gameState = useGameStore((s) => s.gameState);

  useEffect(() => {
    socket.on("game:phase_changed", setGameState);

    return () => {
      socket.off("game:phase_changed", setGameState);
    };
  }, [socket, setGameState]);

  return gameState;
}
