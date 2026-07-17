import { GRID_SIZE, type Coord } from "./constants.ts";
import { Board, SeededRandom, inBounds, sameCoord } from "./engine.ts";

function neighbors(center: Coord) {
  const cells: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const coord = { x: center.x + dx, y: center.y + dy };
    if (inBounds(coord)) cells.push(coord);
  }
  return cells;
}

export function nextSubmarineWake(board: Board, current: Coord[], rng: SeededRandom) {
  const alive = board.ships.filter((ship) => !ship.sunk);
  if (alive.length !== 1 || alive[0].id !== "submarine") return null;
  const submarine = alive[0].cells[0];
  const surrounding = neighbors(submarine);
  const unused = surrounding.filter((coord) => !current.some((seen) => sameCoord(seen, coord)));
  return { ...(unused.length ? rng.pick(unused) : rng.pick(surrounding)) };
}

export function submarineWakeCandidates(waves: Coord[]) {
  const candidates: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const coord = { x, y };
    if (waves.every((wave) => !sameCoord(wave, coord) && Math.abs(wave.x - x) <= 1 && Math.abs(wave.y - y) <= 1)) candidates.push(coord);
  }
  return candidates;
}
