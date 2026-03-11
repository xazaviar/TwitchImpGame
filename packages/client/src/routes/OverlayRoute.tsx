import { useGameState } from "../hooks/useGameState.js";
import { useSocket } from "../hooks/useSocket.js";

export function OverlayRoute() {
  const { connected } = useSocket();
  const gameState = useGameState();

  if (!connected) return null;

  return (
    <div
      style={{
        padding: "1rem",
        fontFamily: "monospace",
        backgroundColor: "transparent",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "0.5rem 1rem",
          borderRadius: "4px",
          display: "inline-block",
        }}
      >
        <span style={{ color: "#e94560", fontWeight: "bold" }}>
          IMP ADVENTURE
        </span>
        <span style={{ color: "#a0a0b0", marginLeft: "1rem" }}>
          {gameState.phase.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
