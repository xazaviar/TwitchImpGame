import { useSocket } from "../hooks/useSocket.js";
import { useGameState } from "../hooks/useGameState.js";

export function ViewerRoute() {
  const { connected } = useSocket();
  const gameState = useGameState();

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>Horde &amp; Hoard</h1>

      <div
        style={{
          padding: "1rem",
          borderRadius: "8px",
          backgroundColor: "var(--bg-card)",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: connected
                ? "var(--success)"
                : "var(--error)",
            }}
          />
          <span>
            {connected ? "Connected to server" : "Disconnected"}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: "1rem",
          borderRadius: "8px",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <h2 style={{ marginBottom: "0.5rem" }}>Game State</h2>
        <p>
          Phase:{" "}
          <strong style={{ color: "var(--accent)" }}>
            {gameState.phase.toUpperCase()}
          </strong>
        </p>
        {gameState.phase === "keep" && (
          <p>Imps at keep: {gameState.keepState.impsAtKeep}</p>
        )}
      </div>
    </div>
  );
}
