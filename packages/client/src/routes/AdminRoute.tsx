import { useSocket } from "../hooks/useSocket.js";
import { useGameState } from "../hooks/useGameState.js";

export function AdminRoute() {
  const { connected } = useSocket();
  const gameState = useGameState();

  return (
    <div style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>Admin Dashboard</h1>

      <div
        style={{
          padding: "1rem",
          borderRadius: "8px",
          backgroundColor: "var(--bg-card)",
          marginBottom: "1rem",
        }}
      >
        <h2 style={{ marginBottom: "0.5rem" }}>Status</h2>
        <p>Connection: {connected ? "Connected" : "Disconnected"}</p>
        <p>
          Phase:{" "}
          <strong style={{ color: "var(--accent)" }}>
            {gameState.phase.toUpperCase()}
          </strong>
        </p>
      </div>

      <div
        style={{
          padding: "1rem",
          borderRadius: "8px",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <h2 style={{ marginBottom: "0.5rem" }}>Controls</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Adventure controls will be added in Phase 2.
        </p>
      </div>
    </div>
  );
}
