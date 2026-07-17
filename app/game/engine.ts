import { GRID_SIZE, HARPOON_PATTERN, SHIPS, WEAPON_MAX, type Coord, type Orientation, type ShipId } from "./constants.ts";

export type ShotMark = "unknown" | "miss" | "echo" | "hit" | "sunk";
export type AttackKind = "MISS" | "ECHO" | "HIT" | "SUNK" | "ALREADY";
export type Ship = { id: ShipId; name: string; size: number; orientation: Orientation; cells: Coord[]; hits: Set<string>; sunk: boolean };
export type AttackResult = { coord: Coord; kind: AttackKind; shipId?: ShipId; shipName?: string; revealed?: Coord[] };
export type RadarScan = { origin: Coord; contact: boolean; candidates: Coord[] };

export class SeededRandom {
  private state: number;
  constructor(seed = Date.now()) { this.state = seed >>> 0 || 0x9e3779b9; }
  next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
  int(max: number) { return Math.floor(this.next() * max); }
  pick<T>(items: T[]) { return items[this.int(items.length)]; }
  shuffle<T>(items: T[]) { for (let i = items.length - 1; i > 0; i--) { const j = this.int(i + 1); [items[i], items[j]] = [items[j], items[i]]; } return items; }
}

export const keyOf = ({ x, y }: Coord) => `${x},${y}`;
export const inBounds = ({ x, y }: Coord) => x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
export const sameCoord = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;

export class Board {
  ships: Ship[] = [];
  shots: ShotMark[][] = Array.from({ length: GRID_SIZE }, () => Array<ShotMark>(GRID_SIZE).fill("unknown"));
  radarScans: RadarScan[] = [];

  reset() { this.ships = []; this.shots = Array.from({ length: GRID_SIZE }, () => Array<ShotMark>(GRID_SIZE).fill("unknown")); this.radarScans = []; }
  cellsFor(start: Coord, size: number, orientation: Orientation, id?: ShipId): Coord[] {
    const def = id ? SHIPS.find((s) => s.id === id) : undefined;
    const width = def ? (orientation === "horizontal" ? def.width : def.height) : (orientation === "horizontal" ? size : 1);
    const height = def ? (orientation === "horizontal" ? def.height : def.width) : (orientation === "horizontal" ? 1 : size);
    const cells: Coord[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push({ x: start.x + x, y: start.y + y });
    return cells;
  }
  canPlace(id: ShipId, start: Coord, orientation: Orientation) {
    const def = SHIPS.find((s) => s.id === id)!;
    const cells = this.cellsFor(start, def.size, orientation, id);
    return !this.ships.some((s) => s.id === id) && cells.every(inBounds) && cells.every((c) => !this.shipAt(c));
  }
  placeShip(id: ShipId, start: Coord, orientation: Orientation) {
    if (!this.canPlace(id, start, orientation)) return false;
    const def = SHIPS.find((s) => s.id === id)!;
    this.ships.push({ id, name: def.name, size: def.size, orientation, cells: this.cellsFor(start, def.size, orientation, id), hits: new Set(), sunk: false });
    return true;
  }
  removeShip(id: ShipId) {
    const index = this.ships.findIndex((ship) => ship.id === id);
    if (index < 0) return null;
    return this.ships.splice(index, 1)[0];
  }
  randomize(rng: SeededRandom, fleet: ShipId[] = SHIPS.map((ship) => ship.id)) {
    this.reset();
    for (const id of fleet) {
      const def = SHIPS.find((ship) => ship.id === id)!;
      const candidates: Array<{ start: Coord; orientation: Orientation }> = [];
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) for (const orientation of ["horizontal", "vertical"] as Orientation[]) {
        if (this.canPlace(def.id, { x, y }, orientation)) candidates.push({ start: { x, y }, orientation });
      }
      const choice = rng.pick(candidates);
      this.placeShip(def.id, choice.start, choice.orientation);
    }
  }
  shipAt(coord: Coord) { return this.ships.find((ship) => ship.cells.some((c) => sameCoord(c, coord))); }
  attack(coord: Coord): AttackResult {
    if (!inBounds(coord) || this.shots[coord.y][coord.x] !== "unknown") return { coord, kind: "ALREADY" };
    const ship = this.shipAt(coord);
    if (!ship) {
      const echo = this.hasLiveNeighbor(coord);
      this.shots[coord.y][coord.x] = echo ? "echo" : "miss";
      return { coord, kind: echo ? "ECHO" : "MISS" };
    }
    ship.hits.add(keyOf(coord));
    this.shots[coord.y][coord.x] = "hit";
    if (ship.hits.size === ship.size) {
      ship.sunk = true;
      ship.cells.forEach((c) => { this.shots[c.y][c.x] = "sunk"; });
      return { coord, kind: "SUNK", shipId: ship.id, shipName: ship.name, revealed: ship.cells.map((c) => ({ ...c })) };
    }
    return { coord, kind: "HIT" };
  }
  hasLiveNeighbor(coord: Coord) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const ship = this.shipAt({ x: coord.x + dx, y: coord.y + dy });
      if (ship && !ship.sunk) return true;
    }
    return false;
  }
  radar(origin: Coord) {
    const candidates = radarCells(origin).filter((c) => this.shots[c.y][c.x] === "unknown");
    const contact = candidates.some((c) => {
      const ship = this.shipAt(c);
      return ship && !ship.sunk && !ship.hits.has(keyOf(c));
    });
    this.radarScans.push({ origin: { ...origin }, contact: !!contact, candidates: candidates.map((c) => ({ ...c })) });
    return !!contact;
  }
  allPlaced(fleet: ShipId[] = SHIPS.map((ship) => ship.id)) { return fleet.every((id) => this.ships.some((ship) => ship.id === id)); }
  allSunk() { return this.ships.length > 0 && this.ships.every((ship) => ship.sunk); }
  alive(id: ShipId) { const ship = this.ships.find((candidate) => candidate.id === id); return !!ship && !ship.sunk; }
  damageCount() { return this.ships.reduce((n, ship) => n + ship.hits.size, 0); }
}

export function harpoonCells(center: Coord) { return HARPOON_PATTERN.map((o) => ({ x: center.x + o.x, y: center.y + o.y })).filter(inBounds); }
export function radarCells(origin: Coord) { return [{ x: origin.x, y: origin.y }, { x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 }, { x: origin.x + 1, y: origin.y + 1 }].filter(inBounds); }
export const sparrowCells = radarCells;

export class Arsenal {
  uses = { ...WEAPON_MAX };
  reset() { this.uses = { ...WEAPON_MAX }; }
  canUse(id: keyof typeof WEAPON_MAX, board: Board) {
    const carrier = id === "phantom" ? "carrier" : id === "harpoon" ? "battleship" : id === "sparrow" ? "cruiser" : id === "mk45" ? "destroyer" : "submarine";
    return this.uses[id] > 0 && board.alive(carrier);
  }
  spend(id: keyof typeof WEAPON_MAX, board: Board) { if (!this.canUse(id, board)) return false; this.uses[id]--; return true; }
}
