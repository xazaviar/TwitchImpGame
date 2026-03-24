import { useSocket } from "../hooks/useSocket.js";
import { useGameState } from "../hooks/useGameState.js";
import { useGameStore, type ImpData } from "../stores/game.store.js";
import { useAuth } from "../hooks/useAuth.js";
import { useEffect, useState } from "react";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  borderRadius: "8px",
  backgroundColor: "var(--bg-card)",
  marginBottom: "1rem",
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
    <p style={{ color: "var(--warning)", fontSize: "1.1rem" }}>
      Next adventure in: {mins}:{secs.toString().padStart(2, "0")}
    </p>
  );
}

function ImpCard({ imp }: { imp: ImpData }) {
  const weaponColors: Record<string, string> = {
    sword: "#e94560",
    bow: "#4caf50",
    staff: "#9c27b0",
    cross: "#ff9800",
    shield: "#2196f3",
  };
  const color = weaponColors[imp.weapon] ?? "var(--accent)";

  return (
    <div style={{ ...cardStyle, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>{imp.name}</h3>
        <span style={{ color, fontWeight: "bold", textTransform: "capitalize" }}>
          {imp.weapon}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 1rem", fontSize: "0.9rem" }}>
        <span>Level: <strong>{imp.level}</strong></span>
        <span>XP: <strong>{imp.xp}</strong></span>
        <span style={{ color: "#e94560" }}>HP: <strong>{imp.maxHp}</strong></span>
        <span style={{ color: "#ff5722" }}>ATK: <strong>{imp.attack}</strong></span>
        <span style={{ color: "#2196f3" }}>DEF: <strong>{imp.defense}</strong></span>
        <span style={{ color: "#4caf50" }}>SPD: <strong>{imp.speed}</strong></span>
      </div>
      <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--warning)" }}>
        Gold: {imp.gold}
      </div>
    </div>
  );
}

export function ViewerRoute() {
  const { socket, connected } = useSocket();
  const gameState = useGameState();
  const { user, loading, login, logout } = useAuth();
  const {
    secondsRemaining,
    totalPlayers,
    adventureCount,
    keepCount,
    nextAdventureTime,
    myImp,
    myVote,
    voteOptions,
    voteTallies,
    voteResult,
    voteType,
    combatUnits,
    combatOutcome,
    combatLoot,
    currentEvent,
    eventOutcome,
    announcements,
    adventureSummary,
  } = useGameStore();

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>Horde &amp; Hoard</h1>

      {/* Auth bar */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: connected ? "var(--success)" : "var(--error)",
              }}
            />
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>
          <div>
            {loading ? (
              <span style={{ color: "var(--text-secondary)" }}>Loading...</span>
            ) : user ? (
              <span>
                <strong style={{ color: "var(--accent)" }}>{user.displayName}</strong>
                <button
                  onClick={logout}
                  style={{
                    marginLeft: "0.75rem",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #555",
                    backgroundColor: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  Sign Out
                </button>
              </span>
            ) : (
              <button
                onClick={login}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor: "#9146FF",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Sign in with Twitch
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Your Imp */}
      {user && myImp && <ImpCard imp={myImp} />}
      {user && !myImp && (
        <div style={{ ...cardStyle, borderLeft: "3px solid var(--text-secondary)" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            No imp yet! Type <strong>!join</strong> in Twitch chat to create yours.
          </p>
        </div>
      )}

      {/* Phase + status */}
      <div style={cardStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>
          Phase:{" "}
          <span style={{ color: "var(--accent)" }}>
            {gameState.phase.toUpperCase()}
          </span>
        </h2>

        {secondsRemaining > 0 && gameState.phase !== "keep" && (
          <p style={{ fontSize: "1.5rem", color: "var(--warning)" }}>
            {secondsRemaining}s
          </p>
        )}

        {/* Keep phase */}
        {gameState.phase === "keep" && (
          <div>
            <p>Total imps in horde: <strong>{totalPlayers}</strong></p>
            <KeepCountdown nextAdventureTime={nextAdventureTime} />
          </div>
        )}

        {/* Adventure split */}
        {gameState.phase !== "keep" && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
            <span style={{ color: "var(--success)" }}>
              Adventuring: <strong>{adventureCount}</strong>
            </span>
            <span style={{ color: "var(--text-secondary)" }}>
              At keep: <strong>{keepCount}</strong>
            </span>
          </div>
        )}

        {/* Traveling */}
        {gameState.phase === "traveling" && (
          <p style={{ marginTop: "0.5rem" }}>
            Marching to <strong>{gameState.travelState.destination}</strong>...
          </p>
        )}

        {/* Adventure stats */}
        {"adventure" in gameState && gameState.adventure && (
          <div style={{ marginTop: "0.5rem" }}>
            <p>Area: <strong>{gameState.adventure.currentAreaId}</strong></p>
            <p>Step: {gameState.adventure.currentStep} / 5</p>
            <p>Surviving: {gameState.adventure.survivingImpCount} imps</p>
            <p>
              Loot: {gameState.adventure.lootPool.gold}g,{" "}
              {gameState.adventure.lootPool.materials}m
            </p>
          </div>
        )}
      </div>

      {/* Voting */}
      {voteOptions.length > 0 && !voteResult && (
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "0.5rem" }}>
            Vote ({voteType})
            {!user && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                Sign in to vote from web
              </span>
            )}
          </h3>
          {voteOptions.map((opt, i) => {
            const count = voteTallies[opt.id] ?? 0;
            const isMyVote = myVote === opt.id;
            return (
              <div
                key={opt.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem",
                  marginBottom: "0.25rem",
                  borderRadius: "4px",
                  backgroundColor: isMyVote ? "rgba(76, 175, 80, 0.15)" : "var(--bg-secondary)",
                  border: isMyVote ? "1px solid var(--success)" : "1px solid transparent",
                  cursor: user ? "pointer" : "default",
                  opacity: user ? 1 : 0.7,
                  transition: "all 0.2s",
                }}
                onClick={() => {
                  if (user) socket.emit("vote:cast", { optionId: opt.id });
                }}
              >
                <span>
                  <span>
                    <strong>{i + 1}.</strong> {opt.name}
                    {opt.description && (
                      <span style={{ color: "var(--text-secondary)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                        — {opt.description}
                      </span>
                    )}
                  </span>
                </span>
                <span style={{ color: "var(--accent)", fontWeight: "bold" }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Vote result */}
      {voteResult && (
        <div style={{ ...cardStyle, borderLeft: "3px solid var(--success)" }}>
          <p>
            Vote result: <strong>{voteResult.winnerName}</strong>
          </p>
        </div>
      )}

      {/* Combat */}
      {combatUnits.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ marginBottom: "0.5rem" }}>Combat</h3>
          <div style={{ display: "flex", gap: "2rem" }}>
            <div>
              <h4 style={{ color: "var(--success)", marginBottom: "0.25rem" }}>Imps</h4>
              {combatUnits
                .filter((u) => u.isImp)
                .map((u) => (
                  <p key={u.id}>
                    {u.name} ({u.weapon}) — {u.hp}/{u.maxHp} HP
                  </p>
                ))}
            </div>
            <div>
              <h4 style={{ color: "var(--error)", marginBottom: "0.25rem" }}>Enemies</h4>
              {combatUnits
                .filter((u) => !u.isImp)
                .map((u) => (
                  <p key={u.id}>
                    {u.name} — {u.hp}/{u.maxHp} HP
                  </p>
                ))}
            </div>
          </div>
          {combatOutcome && (
            <p style={{ marginTop: "0.5rem", fontWeight: "bold", color: combatOutcome === "victory" ? "var(--success)" : "var(--error)" }}>
              {combatOutcome === "victory" ? "Victory!" : "Defeat..."}
              {combatLoot && combatOutcome === "victory" && (
                <span style={{ fontWeight: "normal", color: "var(--warning)" }}>
                  {" "}— +{combatLoot.gold}g, +{combatLoot.materials}m
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Event */}
      {currentEvent && !eventOutcome && (
        <div style={cardStyle}>
          <h3>{currentEvent.name}</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
            {currentEvent.description}
          </p>
          {currentEvent.choices.map((c, i) => {
            const isMyChoice = myVote === c.id;
            return (
              <div
                key={c.id}
                style={{
                  padding: "0.5rem",
                  marginBottom: "0.25rem",
                  borderRadius: "4px",
                  backgroundColor: isMyChoice ? "rgba(76, 175, 80, 0.15)" : "var(--bg-secondary)",
                  border: isMyChoice ? "1px solid var(--success)" : "1px solid transparent",
                  cursor: user ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
                onClick={() => {
                  if (user) socket.emit("vote:cast", { optionId: c.id });
                }}
              >
                <span>
                  <strong>{i + 1}.</strong> {c.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Event outcome */}
      {eventOutcome && (
        <div
          style={{
            ...cardStyle,
            borderLeft: `3px solid ${eventOutcome.success ? "var(--success)" : "var(--error)"}`,
          }}
        >
          <p>{eventOutcome.narrative}</p>
          {eventOutcome.rewards && (
            <p style={{ color: "var(--success)" }}>
              {eventOutcome.rewards.gold ? `+${eventOutcome.rewards.gold}g ` : ""}
              {eventOutcome.rewards.materials ? `+${eventOutcome.rewards.materials}m ` : ""}
              {eventOutcome.rewards.healAll ? `+${eventOutcome.rewards.healAll} HP` : ""}
            </p>
          )}
        </div>
      )}

      {/* Adventure summary */}
      {adventureSummary && (
        <div style={{ ...cardStyle, borderLeft: "3px solid var(--accent)" }}>
          <h3>Adventure Complete</h3>
          <p>Outcome: <strong>{adventureSummary.outcome}</strong></p>
          <p>Areas completed: {adventureSummary.areasCompleted}</p>
          <p>Gold: {adventureSummary.goldCollected} | Materials: {adventureSummary.materialsCollected}</p>
        </div>
      )}

      {/* Activity log */}
      {announcements.length > 0 && (
        <div style={{ ...cardStyle, maxHeight: "200px", overflowY: "auto" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Activity</h3>
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
      )}
    </div>
  );
}
