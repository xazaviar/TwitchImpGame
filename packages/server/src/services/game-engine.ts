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
import type { CombatUnit, GridPosition, LootDrop } from "@imp/shared";
import {
  LOCATION_VOTE_DURATION_MS,
  EVENT_VOTE_DURATION_MS,
  POST_BOSS_VOTE_DURATION_MS,
  DEFAULT_TRAVEL_DURATION_MS,
  IDLE_AUTO_ADVENTURE_MS,
  KEEP_GOLD_PERCENTAGE,
  IMP_GOLD_PERCENTAGE,
  MAX_IMPS_PER_COMBAT,
  MAX_COMBAT_ROUNDS,
  XP_PER_ENEMY_KILL,
  XP_PER_COMBAT_PARTICIPATION,
  XP_PER_ASSIST_THRESHOLD,
  XP_PER_HEAL_THRESHOLD,
  XP_PER_COMBAT_STEP_SUCCESS,
  XP_PER_BOSS_SURVIVE,
  computePlaybackDuration,
  COMBAT_RESULT_DISPLAY_MS,
  COMBAT_NETWORK_BUFFER_MS,
  XP_PER_ADVENTURE_SUCCESS,
  computeImpStats,
  getTier,
  TIER_REWARD_MULTIPLIERS,
  TIER_ENEMY_HP_MULTIPLIERS,
  TIER_ENEMY_ATK_MULTIPLIERS,
} from "@imp/shared";
import { simulateCombat } from "./combat-simulator.js";
import type { EnemyCombatInfo } from "./combat-simulator.js";
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

  /** Track how many combats each imp has fought this adventure (for fair rotation) */
  private _combatParticipation: Map<string, number> = new Map();

  /** Track XP earned per imp this adventure */
  private _adventureXp: Map<string, number> = new Map();

  /** Current HP for each imp during adventure (impId → hp). Persists between combats. */
  private _impCurrentHp: Map<string, number> = new Map();

  /** Ordered queue of imp IDs for combat rotation. Front = next to fight. */
  private _impQueue: string[] = [];

  /** Set of imp IDs currently in combat */
  private _inCombatImps: Set<string> = new Set();

  /** Set of imp IDs that died during this adventure */
  private _deadImps: Set<string> = new Set();

  /** Persistent weapon assignments for temp imps (assigned once at adventure start) */
  private _tempImpWeapons: Map<string, string> = new Map();

  /** Areas visited during this adventure (for summary + excluding from post-boss vote) */
  private _areasVisited: string[] = [];

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

  /** Get the set of adventure participant twitch IDs */
  getAdventureParticipantIds(): Set<string> {
    return new Set(this._adventureParticipants);
  }

  /** How many temp imps are on the adventure (alive or dead) */
  getAdventureTempCount(): number {
    // Count temp_ entries in the queue + dead temp imps
    const queueTemps = this._impQueue.filter((id) => id.startsWith("temp_")).length;
    const deadTemps = [...this._deadImps].filter((id) => id.startsWith("temp_")).length;
    return queueTemps + deadTemps;
  }

  /** How many temp imps total exist */
  getTempImpCount(): number {
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
    this._combatParticipation.clear();
    this._adventureXp.clear();
    this._impCurrentHp.clear();
    this._impQueue = [];
    this._inCombatImps.clear();
    this._deadImps.clear();
    this._tempImpWeapons.clear();
    this._areasVisited = [];
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

    // Initialize imp HP from DB and build the combat queue
    this.initializeAdventureState([...results.adventureVoters]);
    this.broadcastQueueUpdate();

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

    if (this._adventure) {
      // Continuing adventure — preserve loot, area count, and adventureId
      this._adventure.currentAreaId = areaId;
      this._adventure.currentStep = 0;
      this._adventure.tier = getTier(this._adventure.totalAreasCompleted);
      this._adventure.survivingImpCount = this._adventureParticipants.size + this._tempImpsAlive;
    } else {
      // Fresh adventure
      this._adventure = {
        adventureId: Date.now(),
        currentAreaId: areaId,
        currentStep: 0,
        totalAreasCompleted: 0,
        tier: 1,
        survivingImpCount: this._adventureParticipants.size + this._tempImpsAlive,
        lootPool: { gold: 0, materials: { wood: 0, stone: 0, bones: 0 }, specialItems: [] },
      };
    }

    this._currentDeadline = arrivalTime;
    this.setPhase("traveling");
    this.startTimerBroadcast(arrivalTime);

    this._areasVisited.push(areaId);
    const tierLabel = this._adventure!.tier > 1 ? ` (Tier ${this._adventure!.tier})` : "";
    this.io.to("game").emit("game:announcement", {
      message: `The horde marches toward ${area?.name ?? areaId}${tierLabel}!`,
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

  // ─── Adventure State Tracking ──────────────────────────────────────────────

  /** Initialize HP and combat queue at the start of an adventure */
  private initializeAdventureState(participantIds: string[]): void {
    const impMap = this.playerService.getImpsByTwitchIds(participantIds);

    // Set each imp's current HP from their DB maxHp
    this._impCurrentHp.clear();
    for (const [twitchId, imp] of impMap.entries()) {
      this._impCurrentHp.set(twitchId, imp.maxHp);
    }

    // Initialize temp imp weapons and HP
    const STARTER_WEAPONS = ["sword", "bow", "staff", "cross", "shield"];
    this._tempImpWeapons.clear();
    for (let i = 0; i < this._tempImpsAlive; i++) {
      const id = `temp_${i}`;
      const weaponId = STARTER_WEAPONS[Math.floor(Math.random() * STARTER_WEAPONS.length)];
      this._tempImpWeapons.set(id, weaponId);
      const stats = computeImpStats(weaponId);
      this._impCurrentHp.set(id, stats.maxHp);
    }

    // Initialize queue: combine all IDs then shuffle together
    const allIds = [...participantIds];
    for (let i = 0; i < this._tempImpsAlive; i++) {
      allIds.push(`temp_${i}`);
    }
    // Fisher-Yates shuffle for uniform randomness
    for (let i = allIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
    }
    this._impQueue = allIds;

    this._inCombatImps.clear();
  }

  /** Get an imp's current HP during adventure (null if not on adventure) */
  getImpCurrentHp(twitchId: string): number | null {
    return this._impCurrentHp.get(twitchId) ?? null;
  }

  /** Get the queue position for an imp (1-based), or null if not in queue */
  getImpQueuePosition(twitchId: string): number | null {
    const idx = this._impQueue.indexOf(twitchId);
    return idx >= 0 ? idx + 1 : null;
  }

  /** Check if an imp is currently in combat */
  isImpInCombat(twitchId: string): boolean {
    return this._inCombatImps.has(twitchId);
  }

  /** Get imp adventure info for a specific player */
  getImpAdventureInfo(twitchId: string): {
    currentHp: number | null;
    maxHp: number | null;
    queuePosition: number | null;
    inCombat: boolean;
  } | null {
    if (!this._adventureParticipants.has(twitchId)) return null;
    const imp = this.playerService.getImpByTwitchId(twitchId);
    return {
      currentHp: this._impCurrentHp.get(twitchId) ?? null,
      maxHp: imp?.maxHp ?? null,
      queuePosition: this.getImpQueuePosition(twitchId),
      inCombat: this._inCombatImps.has(twitchId),
    };
  }

  // ─── Combat (Real) ─────────────────────────────────────────────────────────

  private selectCombatImps(): { active: CombatUnit[]; reserves: CombatUnit[]; impSpawnPositions: GridPosition[] } {
    const encounter = this.adventureRunner.getEncounter(
      this._adventure!.currentAreaId,
      false // spawn positions are the same for boss and regular
    );
    const spawnPositions = encounter?.impSpawnPositions ?? [
      { x: 0, y: 1 }, { x: 0, y: 3 }, { x: 0, y: 5 }, { x: 1, y: 2 }, { x: 1, y: 4 },
    ];

    // Use the queue order for selection (front of queue goes first)
    const realIds = [...this._adventureParticipants];
    const impMap = this.playerService.getImpsByTwitchIds(realIds);

    // Build ordered list from the queue (only include living adventure participants)
    const orderedIds: string[] = [];
    for (const id of this._impQueue) {
      if (id.startsWith("temp_")) {
        orderedIds.push(id);
      } else if (this._adventureParticipants.has(id) && impMap.has(id)) {
        orderedIds.push(id);
      }
    }

    const allUnits: CombatUnit[] = [];

    // Convert to CombatUnits in queue order, using persistent HP
    for (const id of orderedIds) {
      if (id.startsWith("temp_")) {
        const weaponId = this._tempImpWeapons.get(id) ?? "sword";
        const stats = computeImpStats(weaponId);
        const currentHp = this._impCurrentHp.get(id) ?? stats.maxHp;
        allUnits.push({
          id,
          name: `Temp Imp ${id.replace("temp_", "")}`,
          isImp: true,
          weapon: weaponId,
          hp: currentHp,
          maxHp: stats.maxHp,
          attack: stats.attack,
          defense: stats.defense,
          speed: stats.speed,
          luck: stats.luck,
          fervor: stats.fervor,
          position: { x: 0, y: 0 },
        });
      } else {
        const imp = impMap.get(id)!;
        const currentHp = this._impCurrentHp.get(id) ?? imp.maxHp;
        allUnits.push({
          id,
          name: imp.name,
          isImp: true,
          weapon: imp.weapon,
          hp: currentHp,
          maxHp: imp.maxHp,
          attack: imp.attack,
          defense: imp.defense,
          speed: imp.speed,
          luck: imp.luck,
          fervor: imp.fervor,
          position: { x: 0, y: 0 },
        });
      }
    }

    // Split into active (up to 5) and reserves
    const active = allUnits.slice(0, MAX_IMPS_PER_COMBAT);
    const reserves = allUnits.slice(MAX_IMPS_PER_COMBAT);

    // Assign spawn positions
    for (let i = 0; i < active.length; i++) {
      active[i].position = { ...spawnPositions[i % spawnPositions.length] };
    }

    // Track which imps are actively fighting (not reserves — they keep their queue position)
    this._inCombatImps.clear();
    for (const unit of active) {
      this._inCombatImps.add(unit.id);
    }

    // Increment combat participation for active real imps
    for (const unit of active) {
      if (!unit.id.startsWith("temp_")) {
        this._combatParticipation.set(unit.id, (this._combatParticipation.get(unit.id) ?? 0) + 1);
      }
    }

    return { active, reserves, impSpawnPositions: spawnPositions };
  }

  private buildEnemyUnits(encounter: NonNullable<ReturnType<AdventureRunner["getEncounter"]>>): { units: CombatUnit[]; info: Record<string, EnemyCombatInfo> } {
    const tier = this._adventure?.tier ?? 1;
    const hpMult = TIER_ENEMY_HP_MULTIPLIERS[tier - 1] ?? 1;
    const atkMult = TIER_ENEMY_ATK_MULTIPLIERS[tier - 1] ?? 1;

    const units: CombatUnit[] = [];
    const info: Record<string, EnemyCombatInfo> = {};
    let enemyIdx = 0;

    for (const placement of encounter.enemies) {
      const def = this.adventureRunner.getEnemyDef(placement.enemyId);
      if (!def) continue;

      const positions = placement.positions === "random" ? [] : placement.positions;
      const scaledHp = Math.round(def.hp * hpMult);
      const scaledAtk = Math.round(def.attack * atkMult);

      for (let i = 0; i < placement.count; i++) {
        const id = `enemy_${enemyIdx++}`;
        const pos = positions[i] ?? { x: 7, y: i + 1 };
        units.push({
          id,
          name: def.name,
          isImp: false,
          enemyId: def.id,
          hp: scaledHp,
          maxHp: scaledHp,
          attack: scaledAtk,
          defense: def.defense,
          speed: def.speed,
          luck: def.luck,
          fervor: 0,
          position: { ...pos },
        });
        info[id] = {
          attackRange: def.attackRange,
          minAttackRange: def.minAttackRange,
          requiresLineOfSight: def.requiresLineOfSight,
          aiType: def.aiType,
        };
      }
    }

    return { units, info };
  }

  private async runCombatStep(step: number, isBoss: boolean): Promise<void> {
    if (!this._adventure) return;

    this.setPhase(isBoss ? "boss" : "combat");

    this.io.to("game").emit("game:announcement", {
      message: isBoss
        ? "A powerful boss blocks the path!"
        : `Enemies spotted! Combat begins! (Step ${step}/5)`,
    });

    // Get encounter
    const encounter = this.adventureRunner.getEncounter(this._adventure.currentAreaId, isBoss);
    if (!encounter) {
      console.log(`[GameEngine] No encounter found for ${this._adventure.currentAreaId} (boss=${isBoss})`);
      return;
    }

    // Select imps and build enemy units
    const { active, reserves, impSpawnPositions } = this.selectCombatImps();
    const { units: enemyUnits, info: enemyInfo } = this.buildEnemyUnits(encounter);

    // Run real combat simulation
    const result = simulateCombat({
      activeImps: active,
      reserveImps: reserves,
      enemies: enemyUnits,
      enemyInfo,
      gridSize: encounter.gridSize,
      obstacles: encounter.obstacles,
      impSpawnPositions,
      maxRounds: MAX_COMBAT_ROUNDS,
    });

    // Broadcast queue positions before combat starts
    this.broadcastQueueUpdate();

    // Emit combat start + actions (include obstacles for grid visualization)
    // activeCount = active imps + enemies (reserves excluded from initial display)
    const activeCount = active.length + enemyUnits.length;
    this.io.to("game").emit("combat:start", {
      gridSize: result.gridSize,
      units: result.initialUnits,
      activeCount,
      obstacles: encounter.obstacles,
    });

    // Calculate loot upfront so we can include it with actions
    const loot: LootDrop = result.outcome === "victory"
      ? this.adventureRunner.calculateLoot(this._adventure.currentAreaId, isBoss, this._adventure.totalAreasCompleted)
      : { gold: 0, materials: { wood: 0, stone: 0, bones: 0 }, specialItems: [] };

    // Add material drops from killed enemies into the loot sent to client
    if (result.outcome === "victory") {
      for (const unit of enemyUnits) {
        const def = this.adventureRunner.getEnemyDef(unit.enemyId ?? "");
        if (def?.materialDrops) {
          loot.materials.wood += def.materialDrops.wood ?? 0;
          loot.materials.stone += def.materialDrops.stone ?? 0;
          loot.materials.bones += def.materialDrops.bones ?? 0;
        }
      }
    }

    this.io.to("game").emit("combat:actions", {
      actions: result.actions,
      outcome: result.outcome,
      loot,
    });

    // Wait for client playback + result display + network buffer
    const playbackMs = computePlaybackDuration(result.actions)
      + COMBAT_RESULT_DISPLAY_MS
      + COMBAT_NETWORK_BUFFER_MS;
    await this.delay(playbackMs);

    // Update adventure state
    if (this._adventure) {
      // Persist surviving imp HP
      for (const [impId, hp] of Object.entries(result.survivingImpHp)) {
        this._impCurrentHp.set(impId, hp);
      }

      // Count ejections
      const realEjected = result.ejectedImpIds.filter((id) => !id.startsWith("temp_"));
      const tempEjected = result.ejectedImpIds.filter((id) => id.startsWith("temp_"));

      // Remove ejected imps from HP tracking, queue, and adventure; mark as dead
      for (const id of realEjected) {
        this._adventureParticipants.delete(id);
        this._impCurrentHp.delete(id);
        this._impQueue = this._impQueue.filter((qId) => qId !== id);
        this._deadImps.add(id);
      }
      for (const id of tempEjected) {
        this._impCurrentHp.delete(id);
        this._impQueue = this._impQueue.filter((qId) => qId !== id);
        this._deadImps.add(id);
      }
      this._tempImpsAlive = Math.max(0, this._tempImpsAlive - tempEjected.length);

      this._adventure.survivingImpCount = this._adventureParticipants.size + this._tempImpsAlive;
      this._adventure.lootPool.gold += loot.gold;
      this._adventure.lootPool.materials.wood += loot.materials.wood;
      this._adventure.lootPool.materials.stone += loot.materials.stone;
      this._adventure.lootPool.materials.bones += loot.materials.bones;

      // Move combat participants to back of queue
      const participantSet = new Set(result.participants);
      const frontOfQueue = this._impQueue.filter((id) => !participantSet.has(id));
      const backOfQueue = this._impQueue.filter((id) => participantSet.has(id));
      this._impQueue = [...frontOfQueue, ...backOfQueue];

      // Clear in-combat tracking
      this._inCombatImps.clear();

      // Distribute XP
      this.distributeXp(result, isBoss);

      // Track combat stats (kills, damage, assists, etc.)
      this.updateCombatStats(result);

      // Broadcast updated queue positions
      this.broadcastQueueUpdate();
    }

    // Delay after result for victory/defeat display before next phase
    await this.delay(3000);
  }

  private distributeXp(
    result: ReturnType<typeof simulateCombat>,
    isBoss: boolean
  ): void {
    // Calculate XP for each participant
    for (const impId of result.participants) {
      if (impId.startsWith("temp_")) continue; // Temp imps don't get XP

      let xp = XP_PER_COMBAT_PARTICIPATION; // participation

      // Kill credit
      const kills = result.killCredit[impId] ?? [];
      xp += kills.length * XP_PER_ENEMY_KILL;

      // Assists
      const assistCount = result.assists[impId] ?? 0;
      xp += Math.floor(assistCount / XP_PER_ASSIST_THRESHOLD);

      // Heals
      const healCount = result.heals[impId] ?? 0;
      xp += Math.floor(healCount / XP_PER_HEAL_THRESHOLD);

      // Surviving boss participants get bonus
      if (isBoss && result.outcome === "victory" && result.survivingImpIds.includes(impId)) {
        xp += XP_PER_BOSS_SURVIVE;
      }

      if (xp > 0) {
        const newXp = this.playerService.addXpToImp(impId, xp);
        this._adventureXp.set(impId, (this._adventureXp.get(impId) ?? 0) + xp);
        // Notify player
        this.io.to(`player:${impId}`).emit("player:xp_gained", {
          amount: xp,
          total: newXp,
          leveledUp: false, // TODO: level-up detection
        });
      }
    }

    // All surviving imps (even non-participants) get step success XP on victory
    if (result.outcome === "victory") {
      for (const twitchId of this._adventureParticipants) {
        if (!result.participants.includes(twitchId)) {
          const newXp = this.playerService.addXpToImp(twitchId, XP_PER_COMBAT_STEP_SUCCESS);
          this._adventureXp.set(twitchId, (this._adventureXp.get(twitchId) ?? 0) + XP_PER_COMBAT_STEP_SUCCESS);
          this.io.to(`player:${twitchId}`).emit("player:xp_gained", {
            amount: XP_PER_COMBAT_STEP_SUCCESS,
            total: newXp,
            leveledUp: false,
          });
        }
      }
    }
  }

  /** Extract and record per-player combat stats from a combat result */
  private updateCombatStats(result: ReturnType<typeof simulateCombat>): void {
    // Build a lookup: unit id → weapon id (from initialUnits)
    const unitWeapons = new Map<string, string>();
    for (const unit of result.initialUnits) {
      if (unit.weapon) unitWeapons.set(unit.id, unit.weapon);
    }

    // Per-imp accumulators
    const damageDealt = new Map<string, number>();
    const damageTaken = new Map<string, number>();
    const healingDone = new Map<string, number>();
    const highestHit = new Map<string, number>();
    const crits = new Map<string, number>();

    // Parse all actions
    for (const action of result.actions) {
      if (action.type === "attack" && action.damage && action.damage > 0) {
        // Damage dealt by actor
        const actorDmg = (damageDealt.get(action.actorId) ?? 0) + action.damage;
        damageDealt.set(action.actorId, actorDmg);

        // Highest single hit
        const prevMax = highestHit.get(action.actorId) ?? 0;
        if (action.damage > prevMax) highestHit.set(action.actorId, action.damage);

        // Damage taken by target
        if (action.targetId) {
          const targetDmg = (damageTaken.get(action.targetId) ?? 0) + action.damage;
          damageTaken.set(action.targetId, targetDmg);
        }

        // Crit tracking
        if (action.isCrit) {
          crits.set(action.actorId, (crits.get(action.actorId) ?? 0) + 1);
        }
      }

      if (action.type === "heal" && action.healing && action.healing > 0) {
        const heals = (healingDone.get(action.actorId) ?? 0) + action.healing;
        healingDone.set(action.actorId, heals);
      }
    }

    // Now update stats for each real player imp that participated
    for (const impId of result.participants) {
      if (impId.startsWith("temp_")) continue;

      const kills = result.killCredit[impId]?.length ?? 0;
      const assists = result.assists[impId] ?? 0;
      const isDead = result.ejectedImpIds.includes(impId);
      const weaponId = unitWeapons.get(impId);
      const dmgDealt = damageDealt.get(impId) ?? 0;
      const dmgTaken = damageTaken.get(impId) ?? 0;
      const healed = healingDone.get(impId) ?? 0;
      const critCount = crits.get(impId) ?? 0;
      const maxHit = highestHit.get(impId) ?? 0;

      // Increment numeric stats
      this.playerService.incrementStats(impId, {
        totalKills: kills,
        totalDamageDealt: dmgDealt,
        totalDamageTaken: dmgTaken,
        totalHealingDone: healed,
        totalAssists: assists,
        totalDeaths: isDead ? 1 : 0,
        combatsParticipated: 1,
        totalCrits: critCount,
      });

      // Update highest single hit
      if (maxHit > 0) {
        this.playerService.updateHighestDamage(impId, maxHit);
      }

      // Per-weapon damage breakdown
      if (weaponId && dmgDealt > 0) {
        this.playerService.addDamageByWeapon(impId, weaponId, dmgDealt);
      }

      // Per-enemy-type kill breakdown
      if (kills > 0) {
        const killedEnemies = result.killCredit[impId] ?? [];
        // Count kills by enemy type using initialUnits
        const killsByType = new Map<string, number>();
        for (const enemyId of killedEnemies) {
          const enemyUnit = result.initialUnits.find((u) => u.id === enemyId);
          const enemyTypeId = enemyUnit?.enemyId ?? "unknown";
          killsByType.set(enemyTypeId, (killsByType.get(enemyTypeId) ?? 0) + 1);
        }
        for (const [enemyTypeId, count] of killsByType) {
          this.playerService.addKillsByEnemyType(impId, enemyTypeId, count);
        }
      }
    }
  }

  /** Broadcast queue positions to all clients */
  private broadcastQueueUpdate(): void {
    // Build queue info: { impId → position (1-based, excluding in-combat), "combat", or "dead" }
    const queueInfo: Record<string, number | "combat" | "dead"> = {};

    // Number queue positions, skipping in-combat imps so position 1 = next to fight
    let queueNum = 1;
    for (const id of this._impQueue) {
      if (this._inCombatImps.has(id)) {
        queueInfo[id] = "combat";
      } else {
        queueInfo[id] = queueNum++;
      }
    }

    // Include dead imps
    for (const id of this._deadImps) {
      queueInfo[id] = "dead";
    }

    // Build imp details for admin view (name, level, weapon)
    const allIds = [...this._impQueue, ...this._deadImps];
    const realIds = allIds.filter((id) => !id.startsWith("temp_"));
    const impMap = this.playerService.getImpsByTwitchIds(realIds);
    const impDetails: Record<string, { name: string; level: number; weapon: string }> = {};
    for (const id of allIds) {
      if (id.startsWith("temp_")) {
        impDetails[id] = { name: `Temp Imp ${id.replace("temp_", "")}`, level: 1, weapon: this._tempImpWeapons.get(id) ?? "?" };
      } else {
        const imp = impMap.get(id);
        if (imp) {
          impDetails[id] = { name: imp.name, level: imp.level, weapon: imp.weapon };
        }
      }
    }

    this.io.to("game").emit("game:queue_update", {
      queue: queueInfo,
      impHp: Object.fromEntries(this._impCurrentHp),
      impDetails,
    });
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
      this._adventure.lootPool.materials.wood += outcome.rewards.wood ?? 0;
      this._adventure.lootPool.materials.stone += outcome.rewards.stone ?? 0;
      this._adventure.lootPool.materials.bones += outcome.rewards.bones ?? 0;

      // Apply healing to persistent HP if event heals
      if (outcome.rewards.healAll) {
        const healAmount = outcome.rewards.healAll;
        for (const [impId, currentHp] of this._impCurrentHp.entries()) {
          // Need maxHp to cap healing
          const imp = impId.startsWith("temp_") ? null : this.playerService.getImpByTwitchId(impId);
          const maxHp = imp?.maxHp ?? currentHp; // fallback for temp imps
          this._impCurrentHp.set(impId, Math.min(maxHp, currentHp + healAmount));
        }
        this.broadcastQueueUpdate();
      }
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

    // Combined vote: area options (excluding all visited areas) + return home
    const visitedSet = new Set(this._areasVisited);
    const areas = this.adventureRunner.getAvailableAreas().filter((a) => !visitedSet.has(a.id));
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
      message: `Area complete! Loot: ${this._adventure.lootPool.gold}g, ${this._adventure.lootPool.materials.wood}w/${this._adventure.lootPool.materials.stone}s/${this._adventure.lootPool.materials.bones}b. Pick a new area or return home!`,
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

    // Distribute gold and adventure success XP to surviving real player imps
    for (const twitchId of this._adventureParticipants) {
      if (goldPerImp > 0) {
        const newGold = this.playerService.addGoldToImp(twitchId, goldPerImp);
        this.io.to(`player:${twitchId}`).emit("player:gold_gained", {
          amount: goldPerImp,
          total: newGold,
        });
      }
      // Adventure success XP
      const newXp = this.playerService.addXpToImp(twitchId, XP_PER_ADVENTURE_SUCCESS);
      this.io.to(`player:${twitchId}`).emit("player:xp_gained", {
        amount: XP_PER_ADVENTURE_SUCCESS,
        total: newXp,
        leveledUp: false,
      });

      // Track adventure stats: successful adventure + gold earned
      this.playerService.incrementStats(twitchId, {
        totalAdventures: 1,
        successfulAdventures: 1,
        totalGoldEarned: goldPerImp,
      });
    }

    // Also track adventure stats for dead real player imps (they participated but didn't survive)
    for (const deadId of this._deadImps) {
      if (deadId.startsWith("temp_")) continue;
      if (this._adventureParticipants.has(deadId)) continue; // already counted above
      this.playerService.incrementStats(deadId, {
        totalAdventures: 1,
        successfulAdventures: 1,
      });
    }

    this.io.to("game").emit("game:announcement", {
      message: `The horde returns! Keep receives ${keepGold}g and ${loot.materials.wood}w/${loot.materials.stone}s/${loot.materials.bones}b. Each surviving imp gets ${goldPerImp}g.`,
    });

    const summary: AdventureSummary = {
      adventureId: this._adventure.adventureId,
      outcome: "success",
      areasVisited: [...this._areasVisited],
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

    // Track adventure stats for all participants (failure — no gold, not successful)
    for (const twitchId of this._adventureParticipants) {
      this.playerService.incrementStats(twitchId, {
        totalAdventures: 1,
      });
    }
    // Dead imps who were removed from _adventureParticipants
    for (const deadId of this._deadImps) {
      if (deadId.startsWith("temp_")) continue;
      if (this._adventureParticipants.has(deadId)) continue;
      this.playerService.incrementStats(deadId, {
        totalAdventures: 1,
      });
    }

    const summary: AdventureSummary = {
      adventureId: this._adventure?.adventureId ?? 0,
      outcome: "failure",
      areasVisited: this._adventure ? [this._adventure.currentAreaId] : [],
      areasCompleted: this._adventure?.totalAreasCompleted ?? 0,
      totalSteps: this._adventure?.currentStep ?? 0,
      participantCount: this._adventureParticipants.size,
      goldCollected: 0,
      materialsCollected: { wood: 0, stone: 0, bones: 0 },
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
