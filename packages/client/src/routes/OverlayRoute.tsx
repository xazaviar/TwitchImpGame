import { useGameState } from "../hooks/useGameState.js";
import { useSocket } from "../hooks/useSocket.js";
import { useGameStore } from "../stores/game.store.js";
import { useEffect, useState } from "react";
import { CombatPlayback } from "../components/CombatPlayback.js";

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
    <span style={{ color: "#ff9800", marginLeft: "1rem" }}>
      Next: {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export function OverlayRoute() {
  const { connected } = useSocket();
  const gameState = useGameState();
  const {
    secondsRemaining,
    totalPlayers,
    adventureCount,
    keepCount,
    nextAdventureTime,
    voteOptions,
    voteTallies,
    voteResult,
    eventOutcome,
    combatUnits,
    combatActions,
    combatOutcome,
    combatLoot,
    adventureSummary,
    announcements,
  } = useGameStore();

  if (!connected) return null;

  const latestAnnouncement = announcements.length > 0
    ? announcements[announcements.length - 1]
    : null;

  return (
    <div
      style={{
        padding: "1rem",
        fontFamily: "monospace",
        backgroundColor: "transparent",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "0.5rem 1rem",
          borderRadius: "4px",
          display: "inline-block",
          marginBottom: "0.5rem",
        }}
      >
        <span style={{ color: "#e94560", fontWeight: "bold" }}>
          HORDE &amp; HOARD
        </span>
        <span style={{ color: "#a0a0b0", marginLeft: "1rem" }}>
          {gameState.phase.toUpperCase()}
        </span>
        {secondsRemaining > 0 && gameState.phase !== "keep" && (
          <span style={{ color: "#ff9800", marginLeft: "1rem" }}>
            {secondsRemaining}s
          </span>
        )}
        {gameState.phase === "keep" && (
          <>
            <span style={{ color: "#888", marginLeft: "1rem", fontSize: "0.85rem" }}>
              {totalPlayers} imps
            </span>
            <KeepCountdown nextAdventureTime={nextAdventureTime} />
          </>
        )}
        {gameState.phase !== "keep" && (
          <span style={{ color: "#888", marginLeft: "1rem", fontSize: "0.85rem" }}>
            {adventureCount} adventuring | {keepCount} at keep
          </span>
        )}
        {"adventure" in gameState && gameState.adventure && (
          <span style={{ color: "#888", marginLeft: "1rem", fontSize: "0.85rem" }}>
            Step {gameState.adventure.currentStep}/5 | {gameState.adventure.lootPool.gold}g
          </span>
        )}
      </div>

      {/* Vote display */}
      {voteOptions.length > 0 && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            display: "inline-block",
            marginLeft: "0.5rem",
          }}
        >
          {voteOptions.map((opt, i) => (
            <span key={opt.id} style={{ color: "#e0e0e0", marginRight: "1rem" }}>
              <strong style={{ color: "#e94560" }}>{i + 1}</strong>. {opt.name}{" "}
              <span style={{ color: "#ff9800" }}>({voteTallies[opt.id] ?? 0})</span>
            </span>
          ))}
        </div>
      )}

      {/* Vote result */}
      {voteResult && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            display: "inline-block",
            marginLeft: "0.5rem",
          }}
        >
          <span style={{ color: "#4caf50" }}>
            Result: <strong>{voteResult.winnerName}</strong>
          </span>
        </div>
      )}

      {/* Event outcome */}
      {eventOutcome && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            display: "inline-block",
            marginLeft: "0.5rem",
            color: eventOutcome.success ? "#4caf50" : "#e94560",
          }}
        >
          {eventOutcome.narrative}
        </div>
      )}

      {/* Combat playback (compact) */}
      {combatUnits.length > 0 && combatActions.length > 0 && !combatOutcome && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            display: "inline-block",
            marginLeft: "0.5rem",
            maxWidth: "300px",
            verticalAlign: "top",
          }}
        >
          <CombatPlayback
            units={combatUnits}
            actions={combatActions}
            outcome={combatOutcome}
            compact
          />
        </div>
      )}

      {/* Combat outcome */}
      {combatOutcome && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            display: "inline-block",
            marginLeft: "0.5rem",
          }}
        >
          <span style={{ color: combatOutcome === "victory" ? "#4caf50" : "#e94560", fontWeight: "bold" }}>
            {combatOutcome === "victory" ? "Victory!" : "Defeat..."}
          </span>
          {combatLoot && combatOutcome === "victory" && (
            <span style={{ color: "#ff9800", marginLeft: "0.5rem" }}>
              +{combatLoot.gold}g | {combatLoot.materials.wood}w / {combatLoot.materials.stone}s / {combatLoot.materials.bones}b
            </span>
          )}
        </div>
      )}

      {/* Adventure summary */}
      {adventureSummary && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            display: "inline-block",
            marginLeft: "0.5rem",
          }}
        >
          <span style={{ color: adventureSummary.outcome === "success" ? "#4caf50" : "#e94560", fontWeight: "bold" }}>
            Adventure {adventureSummary.outcome === "success" ? "Complete" : "Failed"}
          </span>
          {adventureSummary.outcome === "success" && (
            <span style={{ color: "#ff9800", marginLeft: "0.5rem" }}>
              {adventureSummary.goldCollected}g | {adventureSummary.materialsCollected.wood}w / {adventureSummary.materialsCollected.stone}s / {adventureSummary.materialsCollected.bones}b
            </span>
          )}
        </div>
      )}

      {/* Latest announcement */}
      {latestAnnouncement && (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            padding: "0.25rem 0.75rem",
            borderRadius: "4px",
            marginTop: "0.5rem",
            display: "inline-block",
            color: "#a0a0b0",
            fontSize: "0.85rem",
          }}
        >
          {latestAnnouncement}
        </div>
      )}
    </div>
  );
}
