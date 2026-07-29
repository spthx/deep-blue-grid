import { GRID_SIZE, isSubmarine, type Coord, type ShipId } from "./constants.ts";
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

function hasVisibleRadarMark(board: Board, coord: Coord) {
  if (board.shots[coord.y][coord.x] !== "unknown") return false;
  return board.radarScans.some((scan) => {
    const contactResolved = scan.contact && scan.candidates.some((candidate) => {
      const mark = board.shots[candidate.y][candidate.x];
      return mark === "hit" || mark === "sunk";
    });
    return !contactResolved && scan.candidates.some((candidate) => sameCoord(candidate, coord));
  });
}

function hasExistingDisplay(board: Board, current: Coord[], coord: Coord) {
  return board.shots[coord.y][coord.x] !== "unknown"
    || Boolean(board.shipAt(coord))
    || hasVisibleRadarMark(board, coord)
    || current.some((seen) => sameCoord(seen, coord));
}

export function nextSubmarineWake(board: Board, current: Coord[], rng: SeededRandom, actorId?: ShipId) {
  const alive = board.ships.filter((ship) => !ship.sunk);
  const actor = actorId
    ? alive.find((ship) => ship.id === actorId && isSubmarine(ship.id))
    : alive.length === 1 && isSubmarine(alive[0].id) ? alive[0] : undefined;
  if (!actor) return null;
  const submarine = actor.cells[0];
  const available = neighbors(submarine).filter((coord) => !hasExistingDisplay(board, current, coord));
  return available.length ? { ...rng.pick(available) } : null;
}

export function submarineWakeCandidates(waves: Coord[]) {
  const candidates: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const coord = { x, y };
    if (waves.every((wave) => !sameCoord(wave, coord) && Math.abs(wave.x - x) <= 1 && Math.abs(wave.y - y) <= 1)) candidates.push(coord);
  }
  return candidates;
}
