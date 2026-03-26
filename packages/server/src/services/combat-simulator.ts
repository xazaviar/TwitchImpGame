/**
 * Combat Simulator — Pure function, no side effects.
 * Runs a turn-based grid combat and returns the full action log.
 */
import type {
  CombatUnit,
  CombatUnitInfo,
  CombatAction,
  GridPosition,
  GridSize,
} from "@imp/shared";
import {
  gridDistance,
  isInBounds,
  pathfindNext,
  CRIT_CHANCE_PER_LUCK,
  TAUNT_DISTANCE_MULTIPLIER,
  SPECIAL_ACTION_THRESHOLD,
  BASE_WEAPONS,
} from "@imp/shared";

// ─── Types ──────────────────────────────────────────────────

/** Extra combat info for enemies (not part of shared CombatUnit) */
export interface EnemyCombatInfo {
  attackRange: number;
  minAttackRange: number;
  requiresLineOfSight: boolean;
  aiType: string;
}

export interface CombatConfig {
  activeImps: CombatUnit[];
  reserveImps: CombatUnit[];
  enemies: CombatUnit[];
  /** AI info for each enemy, keyed by unit id */
  enemyInfo: Record<string, EnemyCombatInfo>;
  gridSize: GridSize;
  obstacles: GridPosition[];
  impSpawnPositions: GridPosition[];
  maxRounds: number;
}

export interface CombatSimResult {
  actions: CombatAction[];
  gridSize: GridSize;
  initialUnits: CombatUnitInfo[];
  totalRounds: number;
  outcome: "victory" | "defeat";
  ejectedImpIds: string[];
  killCredit: Record<string, string[]>;
  assists: Record<string, number>;
  heals: Record<string, number>;
  participants: string[];
  survivingImpIds: string[];
  /** Surviving imp HP after combat: impId → current hp */
  survivingImpHp: Record<string, number>;
}

// ─── Internal state tracking ────────────────────────────────

interface InternalUnit extends CombatUnit {
  alive: boolean;
  currentFervor: number;
}

// ─── Helpers ────────────────────────────────────────────────

function posKey(p: GridPosition): string {
  return `${p.x},${p.y}`;
}

function buildOccupiedSet(units: InternalUnit[], obstacles: GridPosition[]): Set<string> {
  const set = new Set<string>();
  for (const u of units) {
    if (u.alive) set.add(posKey(u.position));
  }
  for (const o of obstacles) {
    set.add(posKey(o));
  }
  return set;
}

/**
 * Bresenham line of sight check — returns true if LOS is clear.
 * `blockerSet` should include obstacles and enemy positions (allies are transparent).
 */
function hasLineOfSight(from: GridPosition, to: GridPosition, blockerSet: Set<string>): boolean {
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    // Skip the starting and ending cells
    if ((x0 !== from.x || y0 !== from.y) && (x0 !== to.x || y0 !== to.y)) {
      if (blockerSet.has(`${x0},${y0}`)) return false;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return true;
}

/**
 * Build a LOS blocker set for a given unit.
 * Includes obstacles + positions of living enemies of that unit.
 * Allies are transparent to LOS.
 */
function buildLosBlockers(
  unit: InternalUnit,
  allUnits: InternalUnit[],
  obstacleSet: Set<string>
): Set<string> {
  const blockers = new Set(obstacleSet);
  for (const u of allUnits) {
    if (!u.alive) continue;
    if (u.id === unit.id) continue;
    // Enemies of this unit block LOS; allies do not
    if (u.isImp !== unit.isImp) {
      blockers.add(posKey(u.position));
    }
  }
  return blockers;
}

/** Move a unit up to `maxSteps` tiles toward target, respecting obstacles */
function moveToward(
  unit: InternalUnit,
  target: GridPosition,
  maxSteps: number,
  gridSize: GridSize,
  occupied: Set<string>,
  actions: CombatAction[],
  round: number
): void {
  const from = { ...unit.position };
  for (let step = 0; step < maxSteps; step++) {
    // Remove self from occupied for pathfinding
    occupied.delete(posKey(unit.position));
    const next = pathfindNext(unit.position, target, gridSize, occupied);
    occupied.add(posKey(unit.position));

    if (!next) break;
    // Don't move onto target if it's occupied
    if (occupied.has(posKey(next))) break;

    occupied.delete(posKey(unit.position));
    unit.position = next;
    occupied.add(posKey(unit.position));
  }

  if (unit.position.x !== from.x || unit.position.y !== from.y) {
    actions.push({
      turn: round,
      actorId: unit.id,
      type: "move",
      from,
      to: { ...unit.position },
    });
  }
}

/** Move a unit away from a position, up to maxSteps */
function moveAway(
  unit: InternalUnit,
  awayFrom: GridPosition,
  maxSteps: number,
  gridSize: GridSize,
  occupied: Set<string>,
  actions: CombatAction[],
  round: number
): void {
  const from = { ...unit.position };
  const directions: GridPosition[] = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];

  for (let step = 0; step < maxSteps; step++) {
    let bestDir: GridPosition | null = null;
    let bestDist = gridDistance(unit.position, awayFrom);

    for (const dir of directions) {
      const next: GridPosition = { x: unit.position.x + dir.x, y: unit.position.y + dir.y };
      if (!isInBounds(next, gridSize)) continue;
      if (occupied.has(posKey(next))) continue;
      const dist = gridDistance(next, awayFrom);
      if (dist > bestDist) {
        bestDist = dist;
        bestDir = next;
      }
    }

    if (!bestDir) break;
    occupied.delete(posKey(unit.position));
    unit.position = bestDir;
    occupied.add(posKey(unit.position));
  }

  if (unit.position.x !== from.x || unit.position.y !== from.y) {
    actions.push({
      turn: round,
      actorId: unit.id,
      type: "move",
      from,
      to: { ...unit.position },
    });
  }
}

function calculateDamage(
  attacker: InternalUnit,
  defender: InternalUnit,
  damageType: "physical" | "magic" = "physical"
): { damage: number; isCrit: boolean } {
  const isCrit = Math.random() < attacker.luck * CRIT_CHANCE_PER_LUCK;
  // Magic ignores defense
  const base = damageType === "magic"
    ? Math.max(1, attacker.attack)
    : Math.max(1, attacker.attack - defender.defense);
  const damage = isCrit ? base * 2 : base;
  return { damage, isCrit };
}

/** Get the damage type for a weapon (defaults to physical) */
function getWeaponDamageType(weaponId: string | undefined): "physical" | "magic" {
  if (!weaponId) return "physical";
  return BASE_WEAPONS[weaponId]?.damageType ?? "physical";
}

/** Get the AoE type for a weapon */
function getWeaponAoeType(weaponId: string | undefined): string | undefined {
  if (!weaponId) return undefined;
  return BASE_WEAPONS[weaponId]?.aoeType;
}

function toUnitInfo(u: CombatUnit): CombatUnitInfo {
  return {
    id: u.id,
    name: u.name,
    isImp: u.isImp,
    weapon: u.weapon,
    enemyId: u.enemyId,
    hp: u.hp,
    maxHp: u.maxHp,
    fervor: u.fervor,
    position: { ...u.position },
  };
}

// ─── Target selection ───────────────────────────────────────

function findNearestEnemy(
  unit: InternalUnit,
  enemies: InternalUnit[],
  useTaunt: boolean
): InternalUnit | null {
  let best: InternalUnit | null = null;
  let bestDist = Infinity;

  for (const e of enemies) {
    if (!e.alive) continue;
    let dist = gridDistance(unit.position, e.position);
    // Taunt: shield imps appear 3x closer to enemies
    if (useTaunt && e.isImp && e.weapon === "shield") {
      dist *= TAUNT_DISTANCE_MULTIPLIER;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

function findLowestHpAlly(
  unit: InternalUnit,
  allies: InternalUnit[],
  range: number,
  requiresLOS: boolean,
  obstacleSet: Set<string>
): InternalUnit | null {
  let best: InternalUnit | null = null;
  let bestRatio = Infinity;

  for (const a of allies) {
    if (!a.alive || a.id === unit.id) continue;
    if (a.hp >= a.maxHp) continue; // skip full HP allies
    const dist = gridDistance(unit.position, a.position);
    if (dist > range) continue;
    if (requiresLOS && !hasLineOfSight(unit.position, a.position, obstacleSet)) continue;
    const ratio = a.hp / a.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = a;
    }
  }
  return best;
}

// ─── AI Logic ───────────────────────────────────────────────

function resolveImpTurn(
  unit: InternalUnit,
  allUnits: InternalUnit[],
  gridSize: GridSize,
  occupied: Set<string>,
  obstacleSet: Set<string>,
  actions: CombatAction[],
  round: number,
  damageTracker: Map<string, Set<string>>,
  healTracker: Map<string, number>
): void {
  const enemies = allUnits.filter((u) => !u.isImp && u.alive);
  const allies = allUnits.filter((u) => u.isImp && u.alive);
  const weapon = unit.weapon ?? "sword";

  if (weapon === "cross") {
    // Healer: try to heal lowest HP ally (LOS ignores allies, blocked by enemies)
    const losBlockers = buildLosBlockers(unit, allUnits, obstacleSet);
    const target = findLowestHpAlly(unit, allies, 2, true, losBlockers);
    if (target) {
      const dist = gridDistance(unit.position, target.position);
      if (dist <= 2) {
        // Heal
        const healing = Math.min(unit.attack, target.maxHp - target.hp);
        target.hp += healing;
        actions.push({
          turn: round,
          actorId: unit.id,
          type: "heal",
          targetId: target.id,
          healing,
          newHp: target.hp,
        });
        healTracker.set(unit.id, (healTracker.get(unit.id) ?? 0) + 1);
        return;
      } else {
        // Move toward injured ally
        moveToward(unit, target.position, unit.speed, gridSize, occupied, actions, round);
        // Try heal again after moving (rebuild LOS blockers since we moved)
        const newLos = buildLosBlockers(unit, allUnits, obstacleSet);
        const newDist = gridDistance(unit.position, target.position);
        if (newDist <= 2 && hasLineOfSight(unit.position, target.position, newLos)) {
          const healing = Math.min(unit.attack, target.maxHp - target.hp);
          target.hp += healing;
          actions.push({
            turn: round,
            actorId: unit.id,
            type: "heal",
            targetId: target.id,
            healing,
            newHp: target.hp,
          });
          healTracker.set(unit.id, (healTracker.get(unit.id) ?? 0) + 1);
          return;
        }
        return;
      }
    }
    // No one needs healing — attack as fallback (magic damage, single target)
    const enemy = findNearestEnemy(unit, enemies, false);
    if (enemy) {
      resolveMeleeOrRangedAttack(unit, enemy, 2, 1, true, allUnits, gridSize, occupied, obstacleSet, actions, round, damageTracker);
    }
    return;
  }

  if (weapon === "bow") {
    // Bow: range 2-5, can't attack adjacent, no LOS needed, physical damage
    const enemy = findNearestEnemy(unit, enemies, false);
    if (!enemy) return;
    const dist = gridDistance(unit.position, enemy.position);

    if (dist <= 1) {
      // Too close — move away
      moveAway(unit, enemy.position, unit.speed, gridSize, occupied, actions, round);
      // Try to attack after moving away
      const newDist = gridDistance(unit.position, enemy.position);
      if (newDist >= 2 && newDist <= 5) {
        performAttack(unit, enemy, allUnits, actions, round, damageTracker);
      }
      return;
    }

    if (dist >= 2 && dist <= 5) {
      // In range — attack
      performAttack(unit, enemy, allUnits, actions, round, damageTracker);
      return;
    }

    // Too far — move toward
    moveToward(unit, enemy.position, unit.speed, gridSize, occupied, actions, round);
    const newDist = gridDistance(unit.position, enemy.position);
    if (newDist >= 2 && newDist <= 5) {
      performAttack(unit, enemy, allUnits, actions, round, damageTracker);
    }
    return;
  }

  if (weapon === "staff") {
    // Staff: range 3, requires LOS
    const enemy = findNearestEnemy(unit, enemies, false);
    if (!enemy) return;
    resolveMeleeOrRangedAttack(unit, enemy, 3, 1, true, allUnits, gridSize, occupied, obstacleSet, actions, round, damageTracker);
    return;
  }

  // Sword, Shield, or unknown — melee range 1, no LOS
  {
    const useTaunt = false; // Imps don't use taunt for their own targeting
    const enemy = findNearestEnemy(unit, enemies, useTaunt);
    if (!enemy) return;
    resolveMeleeOrRangedAttack(unit, enemy, 1, 1, false, allUnits, gridSize, occupied, obstacleSet, actions, round, damageTracker);
  }
}

function resolveEnemyTurn(
  unit: InternalUnit,
  allUnits: InternalUnit[],
  gridSize: GridSize,
  occupied: Set<string>,
  obstacleSet: Set<string>,
  actions: CombatAction[],
  round: number,
  damageTracker: Map<string, Set<string>>,
  healTracker: Map<string, number>,
  enemyDefs: Map<string, { attackRange: number; minAttackRange: number; requiresLineOfSight: boolean; aiType: string }>
): void {
  const imps = allUnits.filter((u) => u.isImp && u.alive);
  const enemyAllies = allUnits.filter((u) => !u.isImp && u.alive);
  const def = enemyDefs.get(unit.id);
  const aiType = def?.aiType ?? "melee_aggressive";
  const range = def?.attackRange ?? 1;
  const minRange = def?.minAttackRange ?? 1;
  const requiresLOS = def?.requiresLineOfSight ?? false;

  if (aiType === "support_heal") {
    // Heal lowest HP enemy ally (LOS ignores own allies, blocked by imps)
    const losBlockers = buildLosBlockers(unit, allUnits, obstacleSet);
    const target = findLowestHpAlly(unit, enemyAllies, range, requiresLOS, losBlockers);
    if (target) {
      const dist = gridDistance(unit.position, target.position);
      if (dist <= range) {
        const healing = Math.min(unit.attack, target.maxHp - target.hp);
        target.hp += healing;
        actions.push({
          turn: round,
          actorId: unit.id,
          type: "heal",
          targetId: target.id,
          healing,
          newHp: target.hp,
        });
        healTracker.set(unit.id, (healTracker.get(unit.id) ?? 0) + 1);
        return;
      }
      // Move toward ally
      moveToward(unit, target.position, unit.speed, gridSize, occupied, actions, round);
      const newLos = buildLosBlockers(unit, allUnits, obstacleSet);
      const newDist = gridDistance(unit.position, target.position);
      if (newDist <= range && (!requiresLOS || hasLineOfSight(unit.position, target.position, newLos))) {
        const healing = Math.min(unit.attack, target.maxHp - target.hp);
        target.hp += healing;
        actions.push({
          turn: round,
          actorId: unit.id,
          type: "heal",
          targetId: target.id,
          healing,
          newHp: target.hp,
        });
        healTracker.set(unit.id, (healTracker.get(unit.id) ?? 0) + 1);
      }
      return;
    }
    // No one needs healing — attack
    const imp = findNearestEnemy(unit, imps, false);
    if (imp) {
      resolveMeleeOrRangedAttack(unit, imp, range, minRange, requiresLOS, allUnits, gridSize, occupied, obstacleSet, actions, round, damageTracker);
    }
    return;
  }

  if (aiType === "ranged_kite") {
    // Same as bow logic but with enemy's ranges
    const losBlockers = buildLosBlockers(unit, allUnits, obstacleSet);
    const target = findNearestEnemy(unit, imps, true); // uses taunt
    if (!target) return;
    const dist = gridDistance(unit.position, target.position);

    if (dist < minRange) {
      moveAway(unit, target.position, unit.speed, gridSize, occupied, actions, round);
      const newLos = buildLosBlockers(unit, allUnits, obstacleSet);
      const newDist = gridDistance(unit.position, target.position);
      if (newDist >= minRange && newDist <= range && (!requiresLOS || hasLineOfSight(unit.position, target.position, newLos))) {
        performAttack(unit, target, allUnits, actions, round, damageTracker);
      }
      return;
    }

    if (dist >= minRange && dist <= range) {
      if (!requiresLOS || hasLineOfSight(unit.position, target.position, losBlockers)) {
        performAttack(unit, target, allUnits, actions, round, damageTracker);
        return;
      }
    }

    moveToward(unit, target.position, unit.speed, gridSize, occupied, actions, round);
    const newLos = buildLosBlockers(unit, allUnits, obstacleSet);
    const newDist = gridDistance(unit.position, target.position);
    if (newDist >= minRange && newDist <= range && (!requiresLOS || hasLineOfSight(unit.position, target.position, newLos))) {
      performAttack(unit, target, allUnits, actions, round, damageTracker);
    }
    return;
  }

  // melee_aggressive or boss_custom — rush nearest imp with taunt consideration
  {
    const target = findNearestEnemy(unit, imps, true); // uses taunt
    if (!target) return;
    resolveMeleeOrRangedAttack(unit, target, range, minRange, requiresLOS, allUnits, gridSize, occupied, obstacleSet, actions, round, damageTracker);
  }
}

/** Generic move-then-attack for melee/ranged with LOS check */
function resolveMeleeOrRangedAttack(
  unit: InternalUnit,
  target: InternalUnit,
  range: number,
  minRange: number,
  requiresLOS: boolean,
  allUnits: InternalUnit[],
  gridSize: GridSize,
  occupied: Set<string>,
  obstacleSet: Set<string>,
  actions: CombatAction[],
  round: number,
  damageTracker: Map<string, Set<string>>
): void {
  const losBlockers = requiresLOS ? buildLosBlockers(unit, allUnits, obstacleSet) : obstacleSet;
  const dist = gridDistance(unit.position, target.position);

  if (dist >= minRange && dist <= range) {
    if (!requiresLOS || hasLineOfSight(unit.position, target.position, losBlockers)) {
      performAttack(unit, target, allUnits, actions, round, damageTracker);
      return;
    }
  }

  // Move toward target
  moveToward(unit, target.position, unit.speed, gridSize, occupied, actions, round);

  // Try again after move (rebuild LOS blockers since positions may have changed)
  const newLosBlockers = requiresLOS ? buildLosBlockers(unit, allUnits, obstacleSet) : obstacleSet;
  const newDist = gridDistance(unit.position, target.position);
  if (newDist >= minRange && newDist <= range) {
    if (!requiresLOS || hasLineOfSight(unit.position, target.position, newLosBlockers)) {
      performAttack(unit, target, allUnits, actions, round, damageTracker);
    }
  }
}

function performAttack(
  attacker: InternalUnit,
  target: InternalUnit,
  allUnits: InternalUnit[],
  actions: CombatAction[],
  round: number,
  damageTracker: Map<string, Set<string>>
): void {
  const dmgType = getWeaponDamageType(attacker.weapon);
  const aoeType = getWeaponAoeType(attacker.weapon);

  const { damage, isCrit } = calculateDamage(attacker, target, dmgType);
  target.hp = Math.max(0, target.hp - damage);

  actions.push({
    turn: round,
    actorId: attacker.id,
    type: "attack",
    targetId: target.id,
    damage,
    newHp: target.hp,
    isCrit: isCrit || undefined, // only set when true
  });

  // Track damage for assists
  if (!damageTracker.has(target.id)) {
    damageTracker.set(target.id, new Set());
  }
  damageTracker.get(target.id)!.add(attacker.id);

  if (target.hp <= 0) {
    target.alive = false;
    actions.push({
      turn: round,
      actorId: target.id,
      type: "death",
    });
  }

  // AoE splash: hit units in orthogonally adjacent tiles to target at half damage
  if (aoeType === "splash_orthogonal") {
    const splashDamage = Math.floor(damage / 2);
    if (splashDamage > 0) {
      const adjacentOffsets: GridPosition[] = [
        { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
      ];
      for (const offset of adjacentOffsets) {
        const splashPos: GridPosition = {
          x: target.position.x + offset.x,
          y: target.position.y + offset.y,
        };
        // Find any living unit at this position (friend or foe — imps don't care)
        const splashTarget = allUnits.find(
          (u) => u.alive && u.id !== target.id && u.position.x === splashPos.x && u.position.y === splashPos.y
        );
        if (splashTarget) {
          splashTarget.hp = Math.max(0, splashTarget.hp - splashDamage);
          actions.push({
            turn: round,
            actorId: attacker.id,
            type: "attack",
            targetId: splashTarget.id,
            damage: splashDamage,
            newHp: splashTarget.hp,
          });

          if (!damageTracker.has(splashTarget.id)) {
            damageTracker.set(splashTarget.id, new Set());
          }
          damageTracker.get(splashTarget.id)!.add(attacker.id);

          if (splashTarget.hp <= 0) {
            splashTarget.alive = false;
            actions.push({
              turn: round,
              actorId: splashTarget.id,
              type: "death",
            });
          }
        }
      }
    }
  }
}

// ─── Main simulator ─────────────────────────────────────────

export function simulateCombat(config: CombatConfig): CombatSimResult {
  const actions: CombatAction[] = [];

  // Create internal units
  const activeImps: InternalUnit[] = config.activeImps.map((u) => ({
    ...u,
    position: { ...u.position },
    alive: true,
    currentFervor: 0,
  }));
  const reserveImps: InternalUnit[] = config.reserveImps.map((u) => ({
    ...u,
    position: { ...u.position },
    alive: true,
    currentFervor: 0,
  }));
  const enemies: InternalUnit[] = config.enemies.map((u) => ({
    ...u,
    position: { ...u.position },
    alive: true,
    currentFervor: 0,
  }));

  // Build initial units snapshot for client
  // Order: active imps + enemies first (displayed at start), then reserves (hidden until reinforce)
  const starters = [...activeImps, ...enemies];
  const allInitial = [...starters, ...reserveImps];
  const initialUnits: CombatUnitInfo[] = allInitial.map(toUnitInfo);
  const initialPositions: Record<string, GridPosition> = {};
  for (const u of starters) {
    initialPositions[u.id] = { ...u.position };
  }

  // Build enemy def lookup for AI
  const enemyDefs = new Map<string, EnemyCombatInfo>();
  for (const e of enemies) {
    const info = config.enemyInfo[e.id];
    if (info) {
      enemyDefs.set(e.id, info);
    } else {
      enemyDefs.set(e.id, { attackRange: 1, minAttackRange: 1, requiresLineOfSight: false, aiType: "melee_aggressive" });
    }
  }

  // Track participants (all imps that enter combat)
  const participants = new Set<string>(activeImps.map((u) => u.id));
  const ejectedImpIds: string[] = [];

  // Damage tracker: targetId -> set of attackerIds (for assists)
  const damageTracker = new Map<string, Set<string>>();
  // Kill credit: killerId -> [victimIds]
  const killCredit: Record<string, string[]> = {};
  // Heal tracker: healerId -> count
  const healTracker = new Map<string, number>();

  const obstacleSet = new Set<string>(config.obstacles.map(posKey));

  let totalRounds = 0;
  let outcome: "victory" | "defeat" = "defeat";

  for (let round = 1; round <= config.maxRounds; round++) {
    totalRounds = round;

    // Gather all living units
    const allUnits = [...activeImps.filter((u) => u.alive), ...enemies.filter((u) => u.alive)];
    if (allUnits.length === 0) break;

    // Sort by speed desc, ties: imps first, then by id
    allUnits.sort((a, b) => {
      if (b.speed !== a.speed) return b.speed - a.speed;
      if (a.isImp !== b.isImp) return a.isImp ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    const occupied = buildOccupiedSet([...activeImps, ...enemies], config.obstacles);

    // Each unit takes a turn
    for (const unit of allUnits) {
      if (!unit.alive) continue;

      // Accumulate fervor at the beginning of the turn
      unit.currentFervor += unit.fervor;
      if (unit.currentFervor >= SPECIAL_ACTION_THRESHOLD) {
        unit.currentFervor -= SPECIAL_ACTION_THRESHOLD;
        // Special action not implemented yet — just subtract and take normal action
      }

      const actionsBefore = actions.length;

      if (unit.isImp) {
        resolveImpTurn(unit, [...activeImps, ...enemies], config.gridSize, occupied, obstacleSet, actions, round, damageTracker, healTracker);
      } else {
        resolveEnemyTurn(unit, [...activeImps, ...enemies], config.gridSize, occupied, obstacleSet, actions, round, damageTracker, healTracker, enemyDefs);
      }

      // Stamp actor's current fervor on all actions they generated this turn
      for (let i = actionsBefore; i < actions.length; i++) {
        if (actions[i].actorId === unit.id) {
          actions[i].actorFervor = unit.currentFervor;
        }
      }
    }

    // Attribute kills: scan death actions for this round
    for (const action of actions) {
      if (action.turn === round && action.type === "death" && !action.actorId.startsWith("__attributed_")) {
        const deadId = action.actorId;
        // Find who dealt the killing blow (last attack action against this unit this round)
        for (let i = actions.length - 1; i >= 0; i--) {
          if (actions[i].turn === round && actions[i].type === "attack" && actions[i].targetId === deadId) {
            const killerId = actions[i].actorId;
            if (!killCredit[killerId]) killCredit[killerId] = [];
            killCredit[killerId].push(deadId);
            break;
          }
        }
      }
    }

    // End of round: process ejections and reinforcements
    const deadImps = activeImps.filter((u) => !u.alive && !ejectedImpIds.includes(u.id));
    for (const dead of deadImps) {
      ejectedImpIds.push(dead.id);
      actions.push({
        turn: round,
        actorId: dead.id,
        type: "eject",
      });

      // Reinforce from reserves
      if (reserveImps.length > 0) {
        const replacement = reserveImps.shift()!;
        participants.add(replacement.id);

        // Find spawn position
        const spawnOccupied = buildOccupiedSet([...activeImps, ...enemies], config.obstacles);
        let spawnPos: GridPosition | null = null;
        for (const pos of config.impSpawnPositions) {
          if (!spawnOccupied.has(posKey(pos))) {
            spawnPos = pos;
            break;
          }
        }
        if (!spawnPos) {
          // BFS from (0,0) for any empty cell
          for (let x = 0; x < config.gridSize.width && !spawnPos; x++) {
            for (let y = 0; y < config.gridSize.height && !spawnPos; y++) {
              const p = { x, y };
              if (!spawnOccupied.has(posKey(p))) spawnPos = p;
            }
          }
        }

        if (spawnPos) {
          replacement.position = { ...spawnPos };
          replacement.alive = true;
          replacement.currentFervor = 0;
          activeImps.push(replacement);

          actions.push({
            turn: round,
            actorId: dead.id,
            type: "reinforce",
            replacementId: replacement.id,
            replacementName: replacement.name,
            to: { ...spawnPos },
          });
        }
      }
    }

    // Check victory/defeat
    const livingEnemies = enemies.filter((u) => u.alive);
    const livingImps = activeImps.filter((u) => u.alive);

    if (livingEnemies.length === 0) {
      outcome = "victory";
      break;
    }
    if (livingImps.length === 0 && reserveImps.length === 0) {
      outcome = "defeat";
      break;
    }
  }

  // Compute assists: for each dead enemy, all attackers except the killer get an assist
  const assists: Record<string, number> = {};
  for (const [targetId, attackers] of damageTracker.entries()) {
    // Only count if target died
    const targetDied = enemies.find((e) => e.id === targetId && !e.alive)
      || activeImps.find((u) => u.id === targetId && !u.alive);
    if (!targetDied) continue;

    // Find who got the kill
    let killerId: string | null = null;
    for (const [kid, victims] of Object.entries(killCredit)) {
      if (victims.includes(targetId)) { killerId = kid; break; }
    }

    for (const attackerId of attackers) {
      if (attackerId !== killerId) {
        assists[attackerId] = (assists[attackerId] ?? 0) + 1;
      }
    }
  }

  const survivingImps = activeImps.filter((u) => u.alive);
  const survivingImpIds = survivingImps.map((u) => u.id);
  const survivingImpHp: Record<string, number> = {};
  for (const u of survivingImps) {
    survivingImpHp[u.id] = u.hp;
  }

  return {
    actions,
    gridSize: config.gridSize,
    initialUnits,
    totalRounds,
    outcome,
    ejectedImpIds,
    killCredit,
    assists,
    heals: Object.fromEntries(healTracker),
    participants: [...participants],
    survivingImpIds,
    survivingImpHp,
  };
}
