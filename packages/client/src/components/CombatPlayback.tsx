import { useState, useEffect, useRef, useMemo } from "react";
import type { CombatAction, CombatUnitInfo, GridPosition } from "@imp/shared";
import { useGameStore } from "../stores/game.store";

// Action durations (ms) — must stay in sync with @imp/shared/constants/balance.ts
const ACTION_DURATION: Record<string, number> = {
  move: 300,
  attack: 500,
  heal: 500,
  death: 800,
  eject: 600,
  reinforce: 700,
  ability: 600,
};
const ACTION_DURATION_DEFAULT = 400;
const PLAYBACK_INITIAL_DELAY = 500;
const PLAYBACK_POST_ACTION_DELAY = 600;

interface CombatPlaybackProps {
  units: CombatUnitInfo[];
  /** Number of initially active units (active imps + enemies). Reserves not included. */
  activeCount?: number;
  actions: CombatAction[];
  outcome: string | null;
  obstacles?: GridPosition[];
  gridSize?: { width: number; height: number };
  compact?: boolean;
  /** ID of the player's imp to track for live updates */
  myImpId?: string | null;
  /** Called on each playback step with the player's imp live state */
  onMyImpUpdate?: (state: { hp: number; maxHp: number; fervor: number; alive: boolean } | null) => void;
  /** Called when imp deaths/reinforcements happen during playback, for queue updates */
  onQueueChange?: (deadImpIds: string[], reinforcedImpIds: string[]) => void;
}

interface UnitState {
  id: string;
  name: string;
  isImp: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fervor: number;       // current accumulated fervor
  fervorRate: number;    // fervor gain per turn
  alive: boolean;
}

function formatAction(action: CombatAction, unitMap: Map<string, string>): string | null {
  const actorName = unitMap.get(action.actorId) ?? action.actorId;
  const targetName = action.targetId ? (unitMap.get(action.targetId) ?? action.targetId) : "";

  switch (action.type) {
    case "attack":
      return `${actorName} attacks ${targetName} for ${action.damage} dmg${action.newHp !== undefined ? ` (${action.newHp} HP)` : ""}`;
    case "heal":
      return `${actorName} heals ${targetName} for ${action.healing} HP${action.newHp !== undefined ? ` (${action.newHp} HP)` : ""}`;
    case "move":
      return null;
    case "death":
      return `${actorName} has been slain!`;
    case "eject":
      return `${actorName} is ejected from combat!`;
    case "reinforce":
      return `${action.replacementName ?? "A replacement"} joins the fight!`;
    default:
      return null;
  }
}

function CombatGrid({ unitStates, obstacles, gridWidth, gridHeight }: {
  unitStates: UnitState[];
  obstacles: GridPosition[];
  gridWidth: number;
  gridHeight: number;
}) {
  const CELL_SIZE = 40;
  const width = gridWidth * CELL_SIZE;
  const height = gridHeight * CELL_SIZE;

  return (
    <div style={{
      width: width + 2,
      height: height + 2,
      position: "relative",
      border: "1px solid rgba(255,255,255,0.1)",
      backgroundColor: "rgba(0,0,0,0.3)",
      borderRadius: "4px",
      flexShrink: 0,
    }}>
      {/* Grid lines */}
      {Array.from({ length: gridWidth + 1 }).map((_, i) => (
        <div key={`vl${i}`} style={{
          position: "absolute",
          left: i * CELL_SIZE,
          top: 0,
          width: 1,
          height,
          backgroundColor: "rgba(255,255,255,0.05)",
        }} />
      ))}
      {Array.from({ length: gridHeight + 1 }).map((_, i) => (
        <div key={`hl${i}`} style={{
          position: "absolute",
          top: i * CELL_SIZE,
          left: 0,
          width,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.05)",
        }} />
      ))}

      {/* Obstacles */}
      {obstacles.map((o, i) => (
        <div key={`obs${i}`} style={{
          position: "absolute",
          left: o.x * CELL_SIZE + 2,
          top: o.y * CELL_SIZE + 2,
          width: CELL_SIZE - 4,
          height: CELL_SIZE - 4,
          backgroundColor: "#333",
          borderRadius: "3px",
          border: "1px solid #555",
        }} />
      ))}

      {/* Units */}
      {unitStates.filter((u) => u.alive).map((u) => {
        const hpPct = u.maxHp > 0 ? u.hp / u.maxHp : 0;
        const circleSize = CELL_SIZE - 8;
        const label = u.name.length > 4 ? u.name.slice(0, 4) : u.name;
        return (
          <div
            key={u.id}
            title={`${u.name} (${u.hp}/${u.maxHp})`}
            style={{
              position: "absolute",
              left: u.x * CELL_SIZE + 4,
              top: u.y * CELL_SIZE + 4,
              width: circleSize,
              height: circleSize,
              borderRadius: "50%",
              backgroundColor: u.isImp ? `rgba(74, 222, 128, ${0.3 + hpPct * 0.7})` : `rgba(248, 113, 113, ${0.3 + hpPct * 0.7})`,
              border: `2px solid ${u.isImp ? "#4ade80" : "#f87171"}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.5rem",
              fontWeight: "bold",
              color: "#fff",
              textShadow: "0 0 2px #000, 0 0 4px #000",
              lineHeight: 1,
              overflow: "hidden",
              transition: "left 0.3s ease, top 0.3s ease",
            }}
          >
            <span style={{ fontSize: "0.5rem" }}>{label}</span>
            <span style={{ fontSize: "0.45rem", opacity: 0.8 }}>{u.hp}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Compute unit states by replaying actions up to a given index */
function computeStates(
  units: CombatUnitInfo[],
  actions: CombatAction[],
  upToIdx: number,
  activeUnitCount: number
): Map<string, UnitState> {
  const states = new Map<string, UnitState>();
  // Only initialize active combatants (not reserves) — reserves added on reinforce
  const unitLookup = new Map(units.map((u) => [u.id, u]));
  const activeUnits = units.slice(0, activeUnitCount);
  for (const u of activeUnits) {
    states.set(u.id, {
      id: u.id,
      name: u.name,
      isImp: u.isImp,
      x: u.position.x,
      y: u.position.y,
      hp: u.hp,
      maxHp: u.maxHp,
      fervor: 0,
      fervorRate: u.fervor,
      alive: true,
    });
  }

  const slice = actions.slice(0, upToIdx + 1);
  for (const a of slice) {
    switch (a.type) {
      case "move": {
        const unit = states.get(a.actorId);
        if (unit && a.to) {
          unit.x = a.to.x;
          unit.y = a.to.y;
        }
        break;
      }
      case "attack": {
        if (a.targetId && a.newHp !== undefined) {
          const target = states.get(a.targetId);
          if (target) target.hp = a.newHp;
        }
        break;
      }
      case "heal": {
        if (a.targetId && a.newHp !== undefined) {
          const target = states.get(a.targetId);
          if (target) target.hp = Math.min(a.newHp, target.maxHp);
        }
        break;
      }
      case "death": {
        const unit = states.get(a.actorId);
        if (unit) unit.alive = false;
        break;
      }
      case "eject": {
        const unit = states.get(a.actorId);
        if (unit) unit.alive = false;
        break;
      }
      case "reinforce": {
        if (a.replacementId && a.to) {
          const info = unitLookup.get(a.replacementId);
          states.set(a.replacementId, {
            id: a.replacementId,
            name: info?.name ?? a.replacementName ?? "Reinforcement",
            isImp: true,
            x: a.to.x,
            y: a.to.y,
            hp: info?.hp ?? 10,
            maxHp: info?.maxHp ?? 10,
            fervor: 0,
            fervorRate: info?.fervor ?? 0,
            alive: true,
          });
        }
        break;
      }
    }

    // Update actor's fervor from the stamped value
    if (a.actorFervor !== undefined) {
      const actor = states.get(a.actorId);
      if (actor) actor.fervor = a.actorFervor;
    }
  }

  return states;
}

export function CombatPlayback({ units, activeCount, actions, outcome, obstacles = [], gridSize, compact, myImpId, onMyImpUpdate, onQueueChange }: CombatPlaybackProps) {
  const [visibleIdx, setVisibleIdx] = useState(-1);
  const [playbackComplete, setPlaybackComplete] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const gw = gridSize?.width ?? 8;
  const gh = gridSize?.height ?? 8;

  // Only show outcome after playback is complete
  const displayOutcome = playbackComplete ? outcome : null;

  // Reveal the loot/outcome in the store when playback finishes
  const showCombatResult = useGameStore((s) => s.showCombatResult);
  useEffect(() => {
    if (playbackComplete) {
      showCombatResult();
    }
  }, [playbackComplete, showCombatResult]);

  // Build unit name map (includes reinforcements)
  const unitMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) map.set(u.id, u.name);
    for (const a of actions) {
      if (a.type === "reinforce" && a.replacementId && a.replacementName) {
        map.set(a.replacementId, a.replacementName);
      }
    }
    return map;
  }, [units, actions]);

  // Build isImp lookup
  const isImpMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const u of units) map.set(u.id, u.isImp);
    for (const a of actions) {
      if (a.type === "reinforce" && a.replacementId) {
        map.set(a.replacementId, true);
      }
    }
    return map;
  }, [units, actions]);

  // Compute unit states up to the current visible action index
  const resolvedActiveCount = activeCount ?? units.length;
  const stateMap = useMemo(() => {
    return computeStates(units, actions, visibleIdx, resolvedActiveCount);
  }, [units, actions, visibleIdx, resolvedActiveCount]);

  const unitStates = useMemo(() => [...stateMap.values()], [stateMap]);

  // Fire callback with player's imp state on each step
  const onMyImpUpdateRef = useRef(onMyImpUpdate);
  onMyImpUpdateRef.current = onMyImpUpdate;
  const onQueueChangeRef = useRef(onQueueChange);
  onQueueChangeRef.current = onQueueChange;

  useEffect(() => {
    if (myImpId && onMyImpUpdateRef.current) {
      const myState = stateMap.get(myImpId);
      if (myState) {
        onMyImpUpdateRef.current({
          hp: myState.hp,
          maxHp: myState.maxHp,
          fervor: myState.fervor,
          alive: myState.alive,
        });
      }
    }

    // Compute dead and reinforced imp IDs up to this point for queue updates
    if (onQueueChangeRef.current && visibleIdx >= 0) {
      const deadImpIds: string[] = [];
      const reinforcedImpIds: string[] = [];
      const slice = actions.slice(0, visibleIdx + 1);
      for (const a of slice) {
        if (a.type === "death" || a.type === "eject") {
          // Track imp deaths/ejections (not enemies)
          const unit = stateMap.get(a.actorId);
          if (unit && unit.isImp) {
            deadImpIds.push(a.actorId);
          }
        }
        if (a.type === "reinforce" && a.replacementId) {
          reinforcedImpIds.push(a.replacementId);
        }
      }
      onQueueChangeRef.current(deadImpIds, reinforcedImpIds);
    }
  }, [stateMap, myImpId, visibleIdx, actions]);

  // Advance through actions using per-action-type durations
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (actions.length === 0) return;
    cancelledRef.current = false;
    setVisibleIdx(-1);
    setPlaybackComplete(false);

    function scheduleNext(idx: number) {
      if (cancelledRef.current) return;

      if (idx >= actions.length) {
        // All actions shown — brief pause then mark complete
        timerRef.current = setTimeout(() => {
          if (!cancelledRef.current) setPlaybackComplete(true);
        }, PLAYBACK_POST_ACTION_DELAY);
        return;
      }

      // Show this action
      setVisibleIdx(idx);

      // Wait the duration for this action type, then advance
      const duration = ACTION_DURATION[actions[idx].type] ?? ACTION_DURATION_DEFAULT;
      timerRef.current = setTimeout(() => scheduleNext(idx + 1), duration);
    }

    // Initial delay so players see the grid before actions start
    timerRef.current = setTimeout(() => scheduleNext(0), PLAYBACK_INITIAL_DELAY);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [actions]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleIdx]);

  // Build log entries
  const visibleActions = visibleIdx >= 0 ? actions.slice(0, visibleIdx + 1) : [];
  const logEntries: { round: number; text: string; isImpAction: boolean }[] = [];
  for (const a of visibleActions) {
    const text = formatAction(a, unitMap);
    if (text) {
      const isImpAction = isImpMap.get(a.actorId) ?? false;
      logEntries.push({ round: a.turn, text, isImpAction });
    }
  }

  if (compact) {
    const recentEntries = logEntries.slice(-5);
    return (
      <div style={{ fontSize: "0.8rem", lineHeight: "1.3" }}>
        {recentEntries.map((entry, i) => (
          <div key={i} style={{ color: entry.isImpAction ? "#4ade80" : "#f87171", opacity: i < recentEntries.length - 1 ? 0.6 : 1 }}>
            {entry.text}
          </div>
        ))}
        {displayOutcome && (
          <div style={{ fontWeight: "bold", color: displayOutcome === "victory" ? "#4ade80" : "#f87171", marginTop: "0.25rem" }}>
            {displayOutcome === "victory" ? "VICTORY!" : "DEFEAT..."}
          </div>
        )}
      </div>
    );
  }

  // Full mode with grid + log side by side
  return (
    <div style={{
      backgroundColor: "var(--bg-secondary, #1a1a2e)",
      borderRadius: "8px",
      padding: "0.75rem",
      marginBottom: "1rem",
    }}>
      <h3 style={{ marginBottom: "0.5rem", fontSize: "1rem" }}>Combat</h3>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        {/* Grid visualization */}
        <CombatGrid
          unitStates={unitStates}
          obstacles={obstacles}
          gridWidth={gw}
          gridHeight={gh}
        />

        {/* Log panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Unit roster — sorted by turn order within current round, dead at end */}
          {(() => {
            const currentAction = visibleIdx >= 0 && visibleIdx < actions.length ? actions[visibleIdx] : null;
            const currentActorId = currentAction?.actorId ?? null;

            // Determine current round from the visible action
            const currentRound = currentAction?.turn ?? (actions.length > 0 ? actions[0]?.turn ?? 1 : 1);

            // Build turn order for the current round: unique actorIds in order of appearance
            const turnOrder: string[] = [];
            const seen = new Set<string>();
            for (const a of actions) {
              if (a.turn === currentRound && a.actorId && !seen.has(a.actorId)) {
                // Only include "real" actions (move/attack/heal/ability), not eject/death/reinforce
                if (a.type === "move" || a.type === "attack" || a.type === "heal" || a.type === "ability") {
                  seen.add(a.actorId);
                  turnOrder.push(a.actorId);
                }
              }
              if (a.turn > currentRound) break;
            }

            // Sort: by turn order position for living units, dead at end
            const sorted = [...unitStates].sort((a, b) => {
              if (a.alive !== b.alive) return a.alive ? -1 : 1;
              const ai = turnOrder.indexOf(a.id);
              const bi = turnOrder.indexOf(b.id);
              // Units in the turn order come first, in order; others after
              if (ai >= 0 && bi >= 0) return ai - bi;
              if (ai >= 0) return -1;
              if (bi >= 0) return 1;
              return 0;
            });

            return (
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                {sorted.map((u) => {
                  const isActive = u.id === currentActorId && u.alive;
                  return (
                    <span
                      key={u.id}
                      style={{
                        fontSize: "0.7rem",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        backgroundColor: u.isImp ? "rgba(74, 222, 128, 0.15)" : "rgba(248, 113, 113, 0.15)",
                        color: u.alive ? (u.isImp ? "#4ade80" : "#f87171") : "#666",
                        textDecoration: u.alive ? "none" : "line-through",
                        border: isActive ? "1.5px solid #ffd700" : "1.5px solid transparent",
                      }}
                    >
                      {u.name} {u.hp}/{u.maxHp}
                    </span>
                  );
                })}
              </div>
            );
          })()}

          {/* Action log */}
          <div
            ref={logRef}
            style={{
              maxHeight: "260px",
              overflowY: "auto",
              fontSize: "0.75rem",
              lineHeight: "1.4",
            }}
          >
            {logEntries.map((entry, i) => (
              <div
                key={i}
                style={{
                  color: entry.isImpAction ? "#4ade80" : "#f87171",
                  marginBottom: "1px",
                }}
              >
                <span style={{ color: "var(--text-secondary, #666)", marginRight: "4px" }}>R{entry.round}</span>
                {entry.text}
              </div>
            ))}
            {visibleIdx >= actions.length && actions.length > 0 && !displayOutcome && (
              <div style={{ color: "var(--text-secondary, #888)", fontStyle: "italic" }}>
                Awaiting result...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outcome */}
      {displayOutcome && (
        <div style={{
          marginTop: "0.5rem",
          padding: "0.5rem",
          borderRadius: "4px",
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "1.1rem",
          backgroundColor: displayOutcome === "victory" ? "rgba(74, 222, 128, 0.15)" : "rgba(248, 113, 113, 0.15)",
          color: displayOutcome === "victory" ? "#4ade80" : "#f87171",
        }}>
          {displayOutcome === "victory" ? "VICTORY!" : "DEFEAT..."}
        </div>
      )}
    </div>
  );
}
