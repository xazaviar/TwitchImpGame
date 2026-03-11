import type { GridPosition, GridSize } from "../types/combat.js";

/** Manhattan distance between two grid positions */
export function gridDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Check if a position is within grid bounds */
export function isInBounds(pos: GridPosition, size: GridSize): boolean {
  return pos.x >= 0 && pos.x < size.width && pos.y >= 0 && pos.y < size.height;
}

/** BFS pathfinding - returns next step toward target, avoiding occupied cells */
export function pathfindNext(
  from: GridPosition,
  to: GridPosition,
  gridSize: GridSize,
  occupied: Set<string>
): GridPosition | null {
  if (from.x === to.x && from.y === to.y) return null;

  const key = (p: GridPosition) => `${p.x},${p.y}`;
  const queue: { pos: GridPosition; firstStep: GridPosition | null }[] = [
    { pos: from, firstStep: null },
  ];
  const visited = new Set<string>([key(from)]);

  const directions: GridPosition[] = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of directions) {
      const next: GridPosition = {
        x: current.pos.x + dir.x,
        y: current.pos.y + dir.y,
      };
      const nextKey = key(next);

      if (!isInBounds(next, gridSize)) continue;
      if (visited.has(nextKey)) continue;

      const firstStep = current.firstStep ?? next;

      // Reached the target
      if (next.x === to.x && next.y === to.y) {
        return firstStep;
      }

      // Can't walk through occupied cells (except the target)
      if (occupied.has(nextKey)) continue;

      visited.add(nextKey);
      queue.push({ pos: next, firstStep });
    }
  }

  // No path found - try to get closer by moving to an adjacent unoccupied cell
  let bestDir: GridPosition | null = null;
  let bestDist = gridDistance(from, to);

  for (const dir of directions) {
    const next: GridPosition = { x: from.x + dir.x, y: from.y + dir.y };
    if (!isInBounds(next, gridSize)) continue;
    if (occupied.has(key(next))) continue;
    const dist = gridDistance(next, to);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = next;
    }
  }

  return bestDir;
}
