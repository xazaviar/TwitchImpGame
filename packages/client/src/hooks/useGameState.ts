import { useEffect } from "react";
import { useSocket } from "./useSocket.js";
import { useGameStore } from "../stores/game.store.js";
import { getAuthToken } from "../lib/socket.js";

export function useGameState() {
  const { socket } = useSocket();
  const store = useGameStore();

  // Fetch extended state from REST API (includes keepGold, keepMaterials)
  useEffect(() => {
    const fetchExtended = () => {
      fetch("/api/game/state")
        .then((res) => res.json())
        .then((data) => {
          if (data.totalPlayers !== undefined) {
            store.setExtendedState({
              totalPlayers: data.totalPlayers,
              adventureCount: data.adventureCount,
              keepCount: data.keepCount,
              nextAdventureTime: data.nextAdventureTime,
              keepGold: data.keepGold,
              keepWood: data.keepWood,
              keepStone: data.keepStone,
              keepBones: data.keepBones,
            });
          }
        })
        .catch(() => {});
    };

    fetchExtended();
    const interval = setInterval(fetchExtended, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch user's imp data when authenticated
  useEffect(() => {
    const fetchImp = () => {
      const token = getAuthToken();
      if (!token) return;
      fetch("/api/player/imp", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          store.setMyImp(data.imp ?? null);
        })
        .catch(() => {});
    };

    fetchImp();
    // Re-fetch periodically (in case imp levels up, etc.)
    const interval = setInterval(fetchImp, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    socket.on("game:phase_changed", (state) => {
      // Clear stale UI data from previous phase
      store.clearPhaseData();
      // Clear adventure summary when leaving keep (new adventure starting)
      if (state.phase !== "keep" && state.phase !== "returning") {
        store.setAdventureSummary(null);
      }
      // Clear queue state when back at keep
      if (state.phase === "keep") {
        store.clearQueueState();
      }
      store.setGameState(state);
      // Re-fetch extended state on phase change
      fetch("/api/game/state")
        .then((res) => res.json())
        .then((data) => {
          if (data.totalPlayers !== undefined) {
            store.setExtendedState({
              totalPlayers: data.totalPlayers,
              adventureCount: data.adventureCount,
              keepCount: data.keepCount,
              nextAdventureTime: data.nextAdventureTime,
              keepGold: data.keepGold,
              keepWood: data.keepWood,
              keepStone: data.keepStone,
              keepBones: data.keepBones,
            });
          }
        })
        .catch(() => {});
    });

    socket.on("game:timer_update", (data) => store.setSecondsRemaining(data.secondsRemaining));
    socket.on("game:announcement", (data) => store.addAnnouncement(data.message));
    socket.on("game:adventure_ended", (data) => store.setAdventureSummary(data.summary));

    socket.on("vote:options", (data) => store.setVoteOptions(data.options, data.deadline, data.type));
    socket.on("vote:tally_update", (data) => store.setVoteTallies(data.tallies));
    socket.on("vote:result", (data) => store.setVoteResult(data));

    socket.on("combat:start" as any, (data: any) => store.setCombatStart(data.gridSize, data.units, data.activeCount ?? data.units.length, data.obstacles ?? []));
    socket.on("combat:actions" as any, (data: { actions: any[]; outcome: string; loot: any }) => {
      store.setCombatActions(data.actions, data.outcome, data.loot);
    });
    socket.on("combat:result", (data) => store.setCombatResult(data.outcome, data.loot));

    socket.on("event:presented", (data) => store.setCurrentEvent(data.event));
    socket.on("event:vote_update", (data) => store.setEventTallies(data.tallies));
    socket.on("event:outcome", (data) => store.setEventOutcome(data.outcome));

    // Track user's own vote confirmation
    socket.on("player:updated", (data) => {
      if (data.currentVote) {
        store.setMyVote(data.currentVote as string);
      }
    });

    // Queue & HP updates
    socket.on("game:queue_update" as any, (data: { queue: Record<string, number | "combat" | "dead">; impHp: Record<string, number>; impDetails: Record<string, { name: string; level: number; weapon: string }> }) => {
      const stored = localStorage.getItem("hh_user");
      const myTwitchId = stored ? JSON.parse(stored)?.twitchId : null;
      store.setQueueUpdate(data.queue, data.impHp, data.impDetails ?? {}, myTwitchId);
    });

    // Per-player notifications
    socket.on("player:xp_gained" as any, (data: { amount: number; total: number; leveledUp: boolean }) => {
      store.addNotification(`+${data.amount} XP`, "xp");
      if (data.leveledUp) {
        store.addNotification("Level Up!", "level_up");
      }
    });
    socket.on("player:gold_gained" as any, (data: { amount: number; total: number }) => {
      store.addNotification(`+${data.amount} Gold`, "gold");
    });

    return () => {
      socket.off("game:phase_changed");
      socket.off("game:timer_update");
      socket.off("game:announcement");
      socket.off("game:adventure_ended");
      socket.off("vote:options");
      socket.off("vote:tally_update");
      socket.off("vote:result");
      socket.off("combat:start");
      socket.off("combat:actions");
      socket.off("combat:result");
      socket.off("event:presented");
      socket.off("event:vote_update");
      socket.off("event:outcome");
      socket.off("player:updated");
      socket.off("game:queue_update" as any);
      socket.off("player:xp_gained" as any);
      socket.off("player:gold_gained" as any);
    };
  }, [socket]);

  return store.gameState;
}
