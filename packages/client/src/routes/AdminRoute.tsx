import { useSocket } from "../hooks/useSocket.js";
import { useGameState } from "../hooks/useGameState.js";
import { useGameStore } from "../stores/game.store.js";
import { useState, useEffect } from "react";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  borderRadius: "8px",
  backgroundColor: "var(--bg-card)",
  marginBottom: "1rem",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "4px",
  border: "none",
  cursor: "pointer",
  fontWeight: "bold",
  marginRight: "0.5rem",
};

function KeepCountdown({ nextAdventureTime }: { nextAdventureTime: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!nextAdventureTime) return;
    const update = () => {
      setRemaining(Math.max(0, Math.ceil((nextAdventureTime - Date.now()) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [nextAdventureTime]);

  if (!nextAdventureTime || remaining <= 0) return null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <span style={{ color: "var(--warning)" }}>
      Auto-adventure in {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export function AdminRoute() {
  const { socket, connected } = useSocket();
  const gameState = useGameState();
  const {
    secondsRemaining,
    totalPlayers,
    adventureCount,
    keepCount,
    nextAdventureTime,
    keepGold,
    keepMaterials,
    announcements,
    voteOptions,
    voteTallies,
  } = useGameStore();
  const [announceText, setAnnounceText] = useState("");

  const isKeep = gameState.phase === "keep";

  return (
    <div style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>Admin Dashboard</h1>

      {/* Status */}
      <div style={cardStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Status</h2>
        <p>
          Connection:{" "}
          <span style={{ color: connected ? "var(--success)" : "var(--error)" }}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </p>
        <p>
          Phase:{" "}
          <strong style={{ color: "var(--accent)" }}>
            {gameState.phase.toUpperCase()}
          </strong>
          {secondsRemaining > 0 && gameState.phase !== "keep" && (
            <span style={{ color: "var(--warning)", marginLeft: "0.5rem" }}>
              ({secondsRemaining}s)
            </span>
          )}
        </p>

        {/* Player counts */}
        <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem" }}>
          <span>Total imps: <strong>{totalPlayers}</strong></span>
          <span style={{ color: "var(--success)" }}>
            Adventuring: <strong>{adventureCount}</strong>
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            At keep: <strong>{keepCount}</strong>
          </span>
        </div>

        {/* Keep countdown */}
        {isKeep && nextAdventureTime > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <KeepCountdown nextAdventureTime={nextAdventureTime} />
          </div>
        )}

        {/* Adventure info */}
        {"adventure" in gameState && gameState.adventure && (
          <div style={{ marginTop: "0.5rem" }}>
            <p>Area: {gameState.adventure.currentAreaId}</p>
            <p>Step: {gameState.adventure.currentStep}/5</p>
            <p>Surviving: {gameState.adventure.survivingImpCount} imps</p>
            <p>
              Loot: {gameState.adventure.lootPool.gold}g,{" "}
              {gameState.adventure.lootPool.materials}m
            </p>
          </div>
        )}
      </div>

      {/* Keep Treasury */}
      <div style={cardStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Keep Treasury</h2>
        <div style={{ display: "flex", gap: "2rem" }}>
          <span style={{ color: "var(--warning)", fontSize: "1.1rem" }}>
            Gold: <strong>{keepGold}</strong>
          </span>
          <span style={{ color: "var(--accent)", fontSize: "1.1rem" }}>
            Materials: <strong>{keepMaterials}</strong>
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={cardStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Controls</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: isKeep ? "var(--success)" : "#555",
              color: "#fff",
            }}
            disabled={!isKeep}
            onClick={() => socket.emit("admin:start_adventure")}
          >
            Start Adventure
          </button>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: !isKeep ? "var(--error)" : "#555",
              color: "#fff",
            }}
            disabled={isKeep}
            onClick={() => socket.emit("admin:stop_adventure")}
          >
            Stop Adventure
          </button>
          <button
            style={{
              ...buttonStyle,
              backgroundColor: isKeep ? "var(--accent)" : "#555",
              color: "#fff",
            }}
            disabled={!isKeep}
            onClick={() => socket.emit("admin:spawn_imp")}
          >
            Spawn Temp Imp
          </button>
        </div>
      </div>

      {/* Announce */}
      <div style={cardStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Announce</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={announceText}
            onChange={(e) => setAnnounceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && announceText.trim()) {
                socket.emit("admin:announce", { message: announceText.trim() });
                setAnnounceText("");
              }
            }}
            placeholder="Send to chat + overlay..."
            style={{
              flex: 1,
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid #333",
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          />
          <button
            style={{ ...buttonStyle, backgroundColor: "var(--accent)", color: "#fff" }}
            onClick={() => {
              if (announceText.trim()) {
                socket.emit("admin:announce", { message: announceText.trim() });
                setAnnounceText("");
              }
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Active vote */}
      {voteOptions.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ marginBottom: "0.5rem" }}>Active Vote</h2>
          {voteOptions.map((opt) => (
            <div
              key={opt.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
                marginBottom: "0.25rem",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <span>{opt.name}</span>
              <strong>{voteTallies[opt.id] ?? 0}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Activity log */}
      <div style={{ ...cardStyle, maxHeight: "300px", overflowY: "auto" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Activity Log</h2>
        {announcements.length === 0 && (
          <p style={{ color: "var(--text-secondary)" }}>No activity yet.</p>
        )}
        {[...announcements].reverse().map((msg, i) => (
          <p
            key={i}
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              marginBottom: "0.25rem",
            }}
          >
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
}
