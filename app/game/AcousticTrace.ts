import { GRID_SIZE, type Coord } from "./constants.ts";
import { SeededRandom, inBounds, keyOf, sameCoord } from "./engine.ts";

export type AcousticIntel = {
  level: number;
  weak: Coord[];
  candidates: Coord[];
  strong?: Coord;
};

export const emptyAcousticIntel = (): AcousticIntel => ({ level: 0, weak: [], candidates: [] });

function neighbors(center: Coord) {
  const cells: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const coord = { x: center.x + dx, y: center.y + dy };
    if (inBounds(coord)) cells.push(coord);
  }
  return cells;
}

export function advanceAcousticTrace(current: AcousticIntel, submarine: Coord, rng: SeededRandom): AcousticIntel {
  const level = Math.min(5, current.level + 1);
  const weak = current.weak.map((coord) => ({ ...coord }));
  const available = neighbors(submarine).filter((coord) => !weak.some((seen) => sameCoord(seen, coord)));
  if (level <= 2 && available.length) weak.push(rng.pick(available));

  let candidates = current.candidates.map((coord) => ({ ...coord }));
  if (level >= 3) {
    const plausible: Coord[] = [];
    for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
      const coord = { x, y };
      const touchesEveryTrace = weak.every((trace) => Math.abs(trace.x - x) <= 1 && Math.abs(trace.y - y) <= 1 && !sameCoord(trace, coord));
      if (touchesEveryTrace) plausible.push(coord);
    }
    if (!plausible.some((coord) => sameCoord(coord, submarine))) plausible.push({ ...submarine });
    rng.shuffle(plausible);
    const cap = level === 3 ? 6 : 3;
    candidates = [{ ...submarine }, ...plausible.filter((coord) => !sameCoord(coord, submarine))].slice(0, cap);
    rng.shuffle(candidates);
  }

  return { level, weak, candidates, strong: level === 5 ? { ...submarine } : undefined };
}

export function acousticCandidateKeys(intel: AcousticIntel) {
  return new Set(intel.candidates.map(keyOf));
}
