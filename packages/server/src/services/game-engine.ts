import { EventEmitter } from "events";
import type { Server as SocketIOServer } from "socket.io";
import type {
  GameState,
  GamePhase,
  AdventureState,
  VoteOption,
  ServerToClientEvents,
  ClientToServerEvents,
  AdventureSummary,
} from "@imp/shared";
import {
  LOCATION_VOTE_DURATION_MS,
  EVENT_VOTE_DURATION_MS,
  POST_BOSS_VOTE_DURATION_MS,
  DEFAULT_TRAVEL_DURATION_MS,
  IDLE_AUTO_ADVENTURE_MS,
  KEEP_GOLD_PERCENTAGE,
  IMP_GOLD_PERCENTAGE,
} from "@imp/shared";
import type { VotingService, VoteResults } from "./voting.js";
import type { AdventureRunner } from "./adventure-runner.js";
import type { PlayerService } from "./player-service.js";
import type { DrizzleDB } from "../db/index.js";

export class GameEngine extends EventEmitter {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  private db: DrizzleDB;
  private voting: VotingService;
  private adventureRunner: AdventureRunner;
  private playerService: PlayerService;

  private _phase: GamePhase = "keep";
  private _adventure: AdventureState | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _travelTimer: ReturnType<typeof setTimeout> | null = null;
  private _timerInterval: ReturnType<typeof setInterval> | null = null;
  private _currentDeadline: number = 0;

  /** When the keep phase started (for countdown display) */
  private _keepPhaseStartedAt: number = 0;

  /** Twitch IDs of players on the current adventure */
  private _adventureParticipants: Set<string> = new Set();

  /** Temporary imps spawned by admin (for testing) */
  private _tempImpCount: number = 0;
  private _tempImpsAlive: number = 0;

  get phase(): GamePhase {
    return this._phase;
  }

  get adventure(): AdventureState | null {
    return this._adventure;
  }

  /** How many registered players exist total */
  get totalPlayers(): number {
    return this.playerService.getTotalPlayerCount();
  }

  /** How many are on the adventure (real + temp) */
  get adventureParticipantCount(): number {
    return this._adventureParticipants.size + this._tempImpsAlive;
  }

  /** How many are at the keep (non-adventuring real players + queued temp imps) */
  get keepImpCount(): number {
    const realAtKeep = Math.max(0, this.totalPlayers - this._adventureParticipants.size);
    // Before adventure starts, temp imps are queued at keep; during adventure they're counted in adventureParticipantCount
    const tempAtKeep = this._phase === "keep" ? this._tempImpCount : 0;
    return realAtKeep + tempAtKeep;
  }

  /** How many temp imps are queued */
  get tempImpCount(): number {
    return this._tempImpCount;
  }

  /** How many temp imps are alive on the current adventure */
  get tempImpsAlive(): number {
    return this._tempImpsAlive;
  }

  /** Spawn a temporary imp (admin testing feature) */
  spawnTempImp(): void {
    this._tempImpCount++;
    console.log(`[GameEngine] Temp imp spawned (total: ${this._tempImpCount})`);
    this.io.to("game").emit("game:announcement", {
      message: `A temporary imp has been summoned! (${this._tempImpCount} temp imps ready)`,
    });
  }

  /** When the keep idle timer will fire (unix ms), 0 if not in keep phase */
  get nextAdventureTime(): number {
    if (this._phase !== "keep") return 0;
    return this._keepPhaseStartedAt + IDLE_AUTO_ADVENTURE_MS;
  }

  constructor(
    io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
    db: DrizzleDB,
    voting: VotingService,
    adventureRunner: AdventureRunner,
    playerService: PlayerService
  ) {
    super();
    this.io = io;
    this.db = db;
    this.voting = voting;
    this.adventureRunner = adventureRunner;
    this.playerService = playerService;
  }

  /** Initialize the engine */
  start(): void {
    console.log("[GameEngine] Starting game engine");
    this.enterKeepPhase();
  }

  /** Get current game state for broadcasting */
  getGameState(): GameState {
    switch (this._phase) {
      case "keep":
        return {
          phase: "keep",
          keepState: {
            impsAtKeep: this.totalPlayers,
          },
        };
      case "voting":
        return {
          phase: "voting",
          votingState: {
            options: this.voting.getOptions(),
            tallies: this.voting.getTallies(),
            deadline: this._currentDeadline,
            type: this.voting.getVoteType(),
          },
          adventure: this._adventure ?? undefined,
        };
      case "traveling":
        return {
          phase: "traveling",
          travelState: {
            destination: this._adventure?.currentAreaId ?? "unknown",
            arrivalTime: this._currentDeadline,
          },
          adventure: this._adventure!,
        };
      case "combat":
      case "event":
      case "boss":
      case "post_boss":
      case "returning":
        return {
          phase: this._phase,
          adventure: this._adventure!,
        } as GameState;
      default:
        return { phase: "keep", keepState: { impsAtKeep: 0 } };
    }
  }

  /** Extended state for admin/overlay that includes extra info */
  getExtendedState(): {
    gameState: GameState;
    totalPlayers: number;
    adventureCount: number;
    keepCount: number;
    nextAdventureTime: number;
  } {
    // Total includes real players + temp imps (queued or alive)
    const tempImps = this._phase === "keep" ? this._tempImpCount : this._tempImpsAlive;
    return {
      gameState: this.getGameState(),
      totalPlayers: this.totalPlayers + tempImps,
      adventureCount: this.adventureParticipantCount,
      keepCount: this.keepImpCount,
      nextAdventureTime: this.nextAdventureTime,
    };
  }

  /** Broadcast current game state to all connected clients */
  broadcastState(): void {
    const extended = this.getExtendedState();
    this.io.to("game").emit("game:phase_changed", extended.gameState);
    // Also emit extended info as an announcement-like update
    // (We'll add a proper event for this once we refine the socket events)
  }

  // ─── Phase Transitions ──────────────────────────────────────────────────────

  private setPhase(phase: GamePhase): void {
    const prev = this._phase;
    this._phase = phase;
    console.log(`[GameEngine] Phase: ${prev} -> ${phase}`);
    this.broadcastState();
  }

  /** Enter keep phase. clearTempImps=true after returning from adventure, false when staying. */
  enterKeepPhase(clearTempImps: boolean = true): void {
    this.clearTimers();
    this._adventure = null;
    this._adventureParticipants.clear();
    if (clearTempImps) {
      this._tempImpCount = 0;
    }
    this._tempImpsAlive = 0;
    this._keepPhaseStartedAt = Date.now();
    this.setPhase("keep");

    // Start idle auto-adventure timer
    this._idleTimer = setTimeout(() => {
      console.log("[GameEngine] Idle timeout — starting location vote");
      this.beginLocationVote();
    }, IDLE_AUTO_ADVENTURE_MS);

    // Start keep countdown broadcast
    this.startTimerBroadcast(this._keepPhaseStartedAt + IDLE_AUTO_ADVENTURE_MS);

    this.io.to("game").emit("game:announcement", {
      message: "The horde rests at the keep. Type !join to create your imp!",
    });
  }

  /** Admin triggers adventure start (skips idle timer, goes straight to vote) */
  startAdventure(): void {
    if (this._phase !== "keep") {
      console.log("[GameEngine] Cannot start adventure — not in keep phase");
      return;
    }

    if (this.totalPlayers === 0) {
      console.log("[GameEngine] No registered players — need at least 1 (!join)");
      this.io.to("game").emit("game:announcement", {
        message: "No imps in the horde yet! Type !join in chat to create your imp.",
      });
      return;
    }

    this.clearTimers();
    this.beginLocationVote();
  }

  /** Stop the current adventure (admin command) */
  stopAdventure(): void {
    if (this._phase === "keep") return;
    console.log("[GameEngine] Adventure stopped by admin");
    this.io.to("game").emit("game:announcement", {
      message: "The adventure has been called off by the lord!",
    });
    this.enterKeepPhase();
  }

  // ─── Location Voting ────────────────────────────────────────────────────────

  private beginLocationVote(): void {
    if (this.totalPlayers === 0) {
      console.log("[GameEngine] No players registered, returning to keep");
      this.enterKeepPhase();
      return;
    }

    const areas = this.adventureRunner.getAvailableAreas();
    const options: VoteOption[] = areas.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
    }));

    // Add "Stay at keep" option
    options.push({
      id: "stay",
      name: "Stay at Keep",
      description: "Your imp stays home. Skip this adventure.",
    });

    const deadline = Date.now() + LOCATION_VOTE_DURATION_MS;
    this._currentDeadline = deadline;

    // Only registered players can vote
    const registeredPlayers = new Set(this.playerService.getAllPlayerTwitchIds());

    this.voting.startVote(
      "location",
      options,
      LOCATION_VOTE_DURATION_MS,
      (results) => this.onLocationVoteResult(results),
      registeredPlayers
    );

    this.setPhase("voting");
    this.startTimerBroadcast(deadline);

    this.io.to("game").emit("vote:options", {
      options,
      deadline,
      type: "location",
    });

    this.io.to("game").emit("game:announcement", {
      message: "Vote for where the horde should venture! Type !vote <number> in chat. Vote 'Stay at Keep' to sit this one out. Not voting = staying home.",
    });
  }

  private onLocationVoteResult(results: VoteResults): void {
    this.clearTimerBroadcast();

    const winnerOption = this.voting.getOptions().find((o) => o.id === results.winnerId);
    this.io.to("game").emit("vote:result", {
      winnerId: results.winnerId,
      winnerName: winnerOption?.name ?? results.winnerId,
    });

    if (results.winnerId === "stay" || results.adventureVoters.size === 0) {
      this.io.to("game").emit("game:announcement", {
        message: "No one voted to adventure! The horde stays at the keep.",
      });
      this.enterKeepPhase(false); // preserve temp imps
      return;
    }

    // All adventure voters (regardless of which area they voted for) go on the adventure
    this._adventureParticipants = new Set(results.adventureVoters);
    this._tempImpsAlive = this._tempImpCount;

    const stayCount = results.stayVoters.size;
    const nonVoterCount = this.totalPlayers - results.adventureVoters.size - stayCount;
    console.log(
      `[GameEngine] Adventure: ${results.adventureVoters.size} adventurers, ${stayCount} staying, ${nonVoterCount} didn't vote (staying)`
    );

    this.io.to("game").emit("game:announcement", {
      message: `${results.adventureVoters.size} imps march to ${winnerOption?.name ?? results.winnerId}! ${stayCount + nonVoterCount} stay at the keep.`,
    });

    this.beginTravel(results.winnerId);
  }

  // ─── Travel ─────────────────────────────────────────────────────────────────

  private beginTravel(areaId: string): void {
    const area = this.adventureRunner.getArea(areaId);
    const travelDuration = area?.travelDuration ?? DEFAULT_TRAVEL_DURATION_MS;
    const arrivalTime = Date.now() + travelDuration;

    this._adventure = {
      adventureId: Date.now(),
      currentAreaId: areaId,
      currentStep: 0,
      totalAreasCompleted: 0,
      survivingImpCount: this._adventureParticipants.size + this._tempImpsAlive,
      lootPool: { gold: 0, materials: 0, specialItems: [] },
    };

    this._currentDeadline = arrivalTime;
    this.setPhase("traveling");
    this.startTimerBroadcast(arrivalTime);

    this.io.to("game").emit("game:announcement", {
      message: `The horde marches toward ${area?.name ?? areaId}!`,
    });

    this._travelTimer = setTimeout(() => {
      this.clearTimerBroadcast();
      this.beginAdventureSteps();
    }, travelDuration);
  }

  // ─── Adventure Step Loop ────────────────────────────────────────────────────

  private async beginAdventureSteps(): Promise<void> {
    if (!this._adventure) return;

    for (let step = 1; step <= 5; step++) {
      if (!this._adventure) return;

      this._adventure.currentStep = step;
      this.broadcastState();

      if (step === 1 || step === 3) {
        await this.runCombatStep(step, false);
      } else if (step === 2 || step === 4) {
        await this.runEventStep(step);
      } else if (step === 5) {
        await this.runCombatStep(step, true);
      }

      if (this._adventure && this._adventure.survivingImpCount <= 0) {
        this.adventureFailure();
        return;
      }

      // If only temp imps remain (all real imps dead), auto-return
      if (this._adventure) {
        const realImps = this._adventure.survivingImpCount - this._tempImpsAlive;
        if (realImps <= 0 && this._tempImpsAlive > 0) {
          this.io.to("game").emit("game:announcement", {
            message: "All player imps have fallen! The temp imps carry loot back to the keep.",
          });
          this.beginReturn();
          return;
        }
      }
    }

    if (this._adventure) {
      this._adventure.totalAreasCompleted++;
      this.beginPostBossVote();
    }
  }

  // ─── Combat (Placeholder) ───────────────────────────────────────────────────

  private async runCombatStep(step: number, isBoss: boolean): Promise<void> {
    if (!this._adventure) return;

    this.setPhase(isBoss ? "boss" : "combat");

    this.io.to("game").emit("game:announcement", {
      message: isBoss
        ? "A powerful boss blocks the path!"
        : `Enemies spotted! Combat begins! (Step ${step}/5)`,
    });

    const result = this.adventureRunner.simulatePlaceholderCombat(
      this._adventure,
      isBoss
    );

    this.io.to("game").emit("combat:start", {
      gridSize: result.gridSize,
      units: result.initialPositions,
    });

    await this.delay(3000);

    this.io.to("game").emit("combat:result", {
      outcome: result.outcome,
      loot: result.loot,
    });

    if (this._adventure) {
      const losses = this._adventure.survivingImpCount - result.survivingImps;
      this._adventure.survivingImpCount = result.survivingImps;
      this._adventure.lootPool.gold += result.loot.gold;
      this._adventure.lootPool.materials += result.loot.materials;

      // Distribute losses proportionally between temp and real imps
      if (losses > 0 && this._tempImpsAlive > 0) {
        const totalBefore = this._adventure.survivingImpCount + losses;
        const tempLosses = Math.min(
          this._tempImpsAlive,
          Math.round(losses * (this._tempImpsAlive / totalBefore))
        );
        this._tempImpsAlive = Math.max(0, this._tempImpsAlive - tempLosses);
      }
    }

    await this.delay(1500);
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  private async runEventStep(_step: number): Promise<void> {
    if (!this._adventure) return;

    this.setPhase("event");

    const event = this.adventureRunner.getRandomEvent();

    this.io.to("game").emit("game:announcement", {
      message: `An event unfolds: ${event.name}`,
    });

    this.io.to("game").emit("event:presented", {
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        choices: event.choices.map((c) => ({ id: c.id, label: c.label })),
      },
      choices: event.choices.map((c) => ({ id: c.id, label: c.label })),
    });

    const results = await this.runEventVote(
      event.choices.map((c) => ({
        id: c.id,
        name: c.label,
        description: c.label,
      }))
    );

    const outcome = this.adventureRunner.resolveEvent(event, results.winnerId);

    this.io.to("game").emit("event:outcome", { outcome });

    if (this._adventure && outcome.rewards) {
      this._adventure.lootPool.gold += outcome.rewards.gold ?? 0;
      this._adventure.lootPool.materials += outcome.rewards.materials ?? 0;
    }

    await this.delay(2000);
  }

  private runEventVote(options: VoteOption[]): Promise<VoteResults> {
    return new Promise((resolve) => {
      const deadline = Date.now() + EVENT_VOTE_DURATION_MS;
      this._currentDeadline = deadline;

      // Only adventure participants can vote on events
      this.voting.startVote(
        "event",
        options,
        EVENT_VOTE_DURATION_MS,
        (results) => {
          this.clearTimerBroadcast();
          resolve(results);
        },
        this._adventureParticipants
      );

      this.startTimerBroadcast(deadline);

      this.io.to("game").emit("vote:options", {
        options,
        deadline,
        type: "event",
      });
    });
  }

  // ─── Post-Boss Vote ─────────────────────────────────────────────────────────

  private beginPostBossVote(): void {
    if (!this._adventure) return;

    // Combined vote: area options (excluding current area) + return home
    const currentAreaId = this._adventure.currentAreaId;
    const areas = this.adventureRunner.getAvailableAreas().filter((a) => a.id !== currentAreaId);
    const options: VoteOption[] = areas.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
    }));

    options.push({
      id: "return",
      name: "Return Home",
      description: "Bring the loot back safely to the keep.",
    });

    const deadline = Date.now() + POST_BOSS_VOTE_DURATION_MS;
    this._currentDeadline = deadline;

    this.voting.startVote(
      "post_boss",
      options,
      POST_BOSS_VOTE_DURATION_MS,
      (results) => this.onPostBossVoteResult(results),
      this._adventureParticipants
    );

    this.setPhase("post_boss");
    this.startTimerBroadcast(deadline);

    this.io.to("game").emit("vote:options", {
      options,
      deadline,
      type: "post_boss",
    });

    this.io.to("game").emit("game:announcement", {
      message: `Area complete! Loot: ${this._adventure.lootPool.gold}g, ${this._adventure.lootPool.materials}m. Pick a new area or return home!`,
    });
  }

  private onPostBossVoteResult(results: VoteResults): void {
    this.clearTimerBroadcast();

    const winnerOption = this.voting.getOptions().find((o) => o.id === results.winnerId);
    this.io.to("game").emit("vote:result", {
      winnerId: results.winnerId,
      winnerName: winnerOption?.name ?? results.winnerId,
    });

    // "return", "stay" (from voting service), or no adventure voters → go home
    if (results.winnerId === "return" || results.winnerId === "stay" || !this._adventure) {
      this.beginReturn();
    } else {
      this.io.to("game").emit("game:announcement", {
        message: `The horde pushes deeper toward ${winnerOption?.name ?? results.winnerId}!`,
      });
      this.beginTravel(results.winnerId);
    }
  }

  // ─── Return Home ────────────────────────────────────────────────────────────

  private beginReturn(): void {
    if (!this._adventure) {
      this.enterKeepPhase();
      return;
    }

    this.setPhase("returning");

    const loot = this._adventure.lootPool;
    const totalSurviving = this._adventure.survivingImpCount; // includes temp imps

    // Gold split: imp pool = Max(numSurvivingImps, floor(5% * totalGold))
    // This ensures each surviving imp gets at least 1 gold
    const impGoldPool = Math.max(totalSurviving, Math.floor(loot.gold * IMP_GOLD_PERCENTAGE));
    // Cap imp gold at total gold (can't give more than we have)
    const actualImpGold = Math.min(impGoldPool, loot.gold);
    const keepGold = loot.gold - actualImpGold;
    const goldPerImp = totalSurviving > 0 ? Math.floor(actualImpGold / totalSurviving) : 0;

    // Deposit keep's share to DB
    this.playerService.depositToKeep(keepGold, loot.materials);

    // Distribute gold to surviving real player imps (temp imps' share vanishes)
    for (const twitchId of this._adventureParticipants) {
      if (goldPerImp > 0) {
        this.playerService.addGoldToImp(twitchId, goldPerImp);
      }
    }

    this.io.to("game").emit("game:announcement", {
      message: `The horde returns! Keep receives ${keepGold}g and ${loot.materials}m. Each surviving imp gets ${goldPerImp}g.`,
    });

    const summary: AdventureSummary = {
      adventureId: this._adventure.adventureId,
      outcome: "success",
      areasVisited: [this._adventure.currentAreaId],
      areasCompleted: this._adventure.totalAreasCompleted,
      totalSteps: this._adventure.currentStep,
      participantCount: this._adventureParticipants.size + this._tempImpsAlive,
      goldCollected: loot.gold,
      materialsCollected: loot.materials,
    };

    this.io.to("game").emit("game:adventure_ended", {
      outcome: "success",
      summary,
    });

    setTimeout(() => {
      this.enterKeepPhase();
    }, 5000);
  }

  private adventureFailure(): void {
    this.io.to("game").emit("game:announcement", {
      message: "All imps have fallen! The horde retreats in shame...",
    });

    const summary: AdventureSummary = {
      adventureId: this._adventure?.adventureId ?? 0,
      outcome: "failure",
      areasVisited: this._adventure ? [this._adventure.currentAreaId] : [],
      areasCompleted: this._adventure?.totalAreasCompleted ?? 0,
      totalSteps: this._adventure?.currentStep ?? 0,
      participantCount: this._adventureParticipants.size,
      goldCollected: 0,
      materialsCollected: 0,
    };

    this.io.to("game").emit("game:adventure_ended", {
      outcome: "failure",
      summary,
    });

    setTimeout(() => {
      this.enterKeepPhase();
    }, 5000);
  }

  // ─── Timer Broadcasting ─────────────────────────────────────────────────────

  private startTimerBroadcast(deadline: number): void {
    this.clearTimerBroadcast();
    this._timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      this.io.to("game").emit("game:timer_update", { secondsRemaining: remaining });
      if (remaining <= 0) {
        this.clearTimerBroadcast();
      }
    }, 1000);
  }

  private clearTimerBroadcast(): void {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  private clearTimers(): void {
    this.clearTimerBroadcast();
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    if (this._travelTimer) {
      clearTimeout(this._travelTimer);
      this._travelTimer = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
