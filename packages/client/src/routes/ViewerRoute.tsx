import { useSocket } from "../hooks/useSocket.js";
import { useGameState } from "../hooks/useGameState.js";
import { useGameStore, type ImpData } from "../stores/game.store.js";
import { useAuth } from "../hooks/useAuth.js";
import { useCallback, useEffect, useState } from "react";
import { CombatPlayback } from "../components/CombatPlayback.js";

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

function StatBar({ label, current, max, color }: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div style={{ marginTop: "0.35rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "2px" }}>
        <span style={{ color }}>{label}</span>
        <span style={{ color }}><strong>{current}</strong> / {max}</span>
      </div>
      <div style={{
        height: "6px",
        borderRadius: "3px",
        backgroundColor: "rgba(255,255,255,0.1)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: color,
          borderRadius: "3px",
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

function ImpCard({ imp, currentHp, currentFervor, queuePosition, isAdventureActive }: {
  imp: ImpData;
  currentHp: number | null;
  currentFervor: number | null;
  queuePosition: number | "combat" | "dead" | null;
  isAdventureActive: boolean;
}) {
  const weaponColors: Record<string, string> = {
    sword: "#e94560",
    bow: "#4caf50",
    staff: "#9c27b0",
    cross: "#ff9800",
    shield: "#2196f3",
  };
  const color = weaponColors[imp.weapon] ?? "var(--accent)";
  const isOnAdventure = currentHp !== null || queuePosition !== null;
  const displayHp = isOnAdventure && currentHp !== null ? currentHp : imp.maxHp;

  // Determine status badge
  let badgeLabel: string | null = null;
  let badgeBg = "rgba(74, 222, 128, 0.15)";
  let badgeColor = "#4ade80";
  if (queuePosition === "combat") {
    badgeLabel = "IN COMBAT";
    badgeBg = "rgba(248, 113, 113, 0.2)";
    badgeColor = "#f87171";
  } else if (queuePosition === "dead") {
    badgeLabel = "DEAD";
    badgeBg = "rgba(150, 150, 150, 0.2)";
    badgeColor = "#888";
  } else if (typeof queuePosition === "number") {
    badgeLabel = `Queue #${queuePosition}`;
  } else if (isAdventureActive) {
    badgeLabel = "AT KEEP";
    badgeBg = "rgba(100, 100, 150, 0.15)";
    badgeColor = "#8888aa";
  }

  return (
    <div style={{ ...cardStyle, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>{imp.name}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {badgeLabel && (
            <span style={{
              fontSize: "0.75rem",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: "bold",
              backgroundColor: badgeBg,
              color: badgeColor,
            }}>
              {badgeLabel}
            </span>
          )}
          <span style={{ color, fontWeight: "bold", textTransform: "capitalize" }}>
            {imp.weapon}
          </span>
        </div>
      </div>

      {/* Level / XP / Gold */}
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
        <span>Lv. <strong>{imp.level}</strong></span>
        <span>XP: <strong>{imp.xp}</strong></span>
        <span style={{ color: "var(--warning)" }}>Gold: <strong>{imp.gold}</strong></span>
      </div>

      {/* HP and Energy bars */}
      <StatBar label="HP" current={displayHp} max={imp.maxHp} color="#e94560" />
      <StatBar label="Energy" current={currentFervor ?? 0} max={10} color="#ffd700" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.25rem 1rem", fontSize: "0.9rem", marginTop: "0.5rem" }}>
        <span style={{ color: "#ff5722" }}>ATK: <strong>{imp.attack}</strong></span>
        <span style={{ color: "#2196f3" }}>DEF: <strong>{imp.defense}</strong></span>
        <span style={{ color: "#6d1ad9" }}>SPD: <strong>{imp.speed}</strong></span>
        <span style={{ color: "#4caf50" }}>LCK: <strong>{imp.luck}</strong></span>
        <span style={{ color: "#ffd700" }}>FRV: <strong>{imp.fervor}</strong></span>
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
    combatActiveCount,
    combatActions,
    combatObstacles,
    combatGrid,
    combatOutcome,
    combatLoot,
    currentEvent,
    eventOutcome,
    announcements,
    adventureSummary,
    queuePosition,
    impCurrentHp,
    impCurrentFervor,
    setCombatLiveState,
    setImpPlaybackDead,
    applyCombatQueueDelta,
  } = useGameStore();

  // Find player's twitch ID for combat tracking
  const stored = localStorage.getItem("hh_user");
  const myTwitchId = stored ? JSON.parse(stored)?.twitchId : null;

  // Callback for live combat updates from CombatPlayback
  const handleMyImpUpdate = useCallback((state: { hp: number; maxHp: number; fervor: number; alive: boolean } | null) => {
    if (!state) return;
    setCombatLiveState(state.hp, state.fervor);
    if (!state.alive) {
      setImpPlaybackDead();
    }
  }, [setCombatLiveState, setImpPlaybackDead]);

  // Callback for queue changes during combat playback
  const handleQueueChange = useCallback((deadImpIds: string[], reinforcedImpIds: string[]) => {
    applyCombatQueueDelta(deadImpIds, reinforcedImpIds, myTwitchId);
  }, [applyCombatQueueDelta, myTwitchId]);

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
      {user && myImp && (
        <ImpCard
          imp={myImp}
          currentHp={impCurrentHp}
          currentFervor={impCurrentFervor}
          queuePosition={queuePosition}
          isAdventureActive={gameState.phase !== "keep"}
        />
      )}
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
            <p>Area: <strong>{gameState.adventure.currentAreaId}</strong>
              <span style={{
                color: gameState.adventure.tier >= 3 ? "#ff4444" : gameState.adventure.tier >= 2 ? "#ffd700" : "#aaa",
                fontWeight: "bold",
                marginLeft: "0.5rem",
              }}>
                TIER {gameState.adventure.tier}
              </span>
            </p>
            <p>Step: {gameState.adventure.currentStep} / 5</p>
            <p>Surviving: {gameState.adventure.survivingImpCount} imps</p>
            <p>
              Loot: {gameState.adventure.lootPool.gold}g |{" "}
              {gameState.adventure.lootPool.materials.wood}w /{" "}
              {gameState.adventure.lootPool.materials.stone}s /{" "}
              {gameState.adventure.lootPool.materials.bones}b
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
        <CombatPlayback
          units={combatUnits}
          activeCount={combatActiveCount}
          actions={combatActions}
          outcome={combatOutcome}
          obstacles={combatObstacles}
          gridSize={combatGrid ?? undefined}
          myImpId={myTwitchId}
          onMyImpUpdate={handleMyImpUpdate}
          onQueueChange={handleQueueChange}
        />
      )}
      {combatOutcome && combatLoot && combatOutcome === "victory" && (
        <div style={{ ...cardStyle, borderLeft: "3px solid var(--warning)" }}>
          <p style={{ color: "var(--warning)" }}>
            Loot: +{combatLoot.gold}g | {combatLoot.materials.wood}w / {combatLoot.materials.stone}s / {combatLoot.materials.bones}b
          </p>
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
              {eventOutcome.rewards.wood ? `+${eventOutcome.rewards.wood} wood ` : ""}
              {eventOutcome.rewards.stone ? `+${eventOutcome.rewards.stone} stone ` : ""}
              {eventOutcome.rewards.bones ? `+${eventOutcome.rewards.bones} bones ` : ""}
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
          <p>Gold: {adventureSummary.goldCollected} | Wood: {adventureSummary.materialsCollected.wood} | Stone: {adventureSummary.materialsCollected.stone} | Bones: {adventureSummary.materialsCollected.bones}</p>
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
