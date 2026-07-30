import { ECHO_DIRECTIONS, GRID_SIZE, HARPOON_PATTERN, ORIENTATIONS, SHIPS, STANDARD_FLEET, WEAPON_MAX, isEscort, isHorizontal, type Coord, type Orientation, type ShipId } from "./constants.ts";

export type ShotMark = "unknown" | "miss" | "echo" | "hit" | "lost" | "sunk";
export type AttackKind = "MISS" | "ECHO" | "HIT" | "SUNK" | "ALREADY";
export type Ship = { id: ShipId; name: string; size: number; orientation: Orientation; cells: Coord[]; critical: Coord; hits: Set<string>; sunk: boolean };
export type AttackResult = { coord: Coord; kind: AttackKind; shipId?: ShipId; shipName?: string; revealed?: Coord[]; criticalHit?: boolean };
export type RadarScan = { origin: Coord; contact: boolean; candidates: Coord[] };
export type RelocationOptions = {
  blocked?: Coord[];
  leaveLastKnown?: boolean;
  relaxSignalBlocksWhenTrapped?: boolean;
  resolveContainmentWhenTrapped?: boolean;
};

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
export function criticalCoordFor(id: ShipId, start: Coord, orientation: Orientation) {
  const def = SHIPS.find((ship) => ship.id === id)!;
  const { x, y } = def.critical;
  if (orientation === "east") return { x: start.x + x, y: start.y + y };
  if (orientation === "south") return { x: start.x + def.height - 1 - y, y: start.y + x };
  if (orientation === "west") return { x: start.x + def.width - 1 - x, y: start.y + def.height - 1 - y };
  return { x: start.x + y, y: start.y + def.width - 1 - x };
}

export class Board {
  ships: Ship[] = [];
  shots: ShotMark[][] = Array.from({ length: GRID_SIZE }, () => Array<ShotMark>(GRID_SIZE).fill("unknown"));
  radarScans: RadarScan[] = [];

  reset() { this.ships = []; this.shots = Array.from({ length: GRID_SIZE }, () => Array<ShotMark>(GRID_SIZE).fill("unknown")); this.radarScans = []; }
  cellsFor(start: Coord, size: number, orientation: Orientation, id?: ShipId): Coord[] {
    const def = id ? SHIPS.find((s) => s.id === id) : undefined;
    const horizontal = isHorizontal(orientation);
    const width = def ? (horizontal ? def.width : def.height) : (horizontal ? size : 1);
    const height = def ? (horizontal ? def.height : def.width) : (horizontal ? 1 : size);
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
    this.ships.push({ id, name: def.name, size: def.size, orientation, cells: this.cellsFor(start, def.size, orientation, id), critical: criticalCoordFor(id, start, orientation), hits: new Set(), sunk: false });
    return true;
  }
  removeShip(id: ShipId) {
    const index = this.ships.findIndex((ship) => ship.id === id);
    if (index < 0) return null;
    return this.ships.splice(index, 1)[0];
  }
  visibleRadarCells() {
    return this.radarScans.flatMap((scan) => {
      const contactResolved = scan.contact && scan.candidates.some((candidate) => {
        const mark = this.shots[candidate.y][candidate.x];
        return mark === "hit" || mark === "lost" || mark === "sunk";
      });
      return contactResolved ? [] : scan.candidates.map((candidate) => ({ ...candidate }));
    });
  }
  randomize(rng: SeededRandom, fleet: ShipId[] = STANDARD_FLEET) {
    const requireDualScreen = fleet.includes("escort") && fleet.includes("escortBravo") && fleet.includes("carrier") && fleet.includes("battleship");
    for (let attempt = 0; attempt < 200; attempt++) {
      this.reset();
      const supportTargets = (["carrier", "battleship"] as const).filter((id) => fleet.includes(id));
      const escorts = fleet.filter(isEscort);
      const placementOrder: ShipId[] = escorts.length && supportTargets.length
        ? [...supportTargets, ...escorts, ...fleet.filter((id) => !supportTargets.includes(id as "carrier" | "battleship") && !isEscort(id))]
        : [...fleet];
      let failed = false;
      for (const id of placementOrder) {
        const def = SHIPS.find((ship) => ship.id === id)!;
        const candidates: Array<{ start: Coord; orientation: Orientation }> = [];
        for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) for (const orientation of ORIENTATIONS) {
          if (this.canPlace(def.id, { x, y }, orientation)) candidates.push({ start: { x, y }, orientation });
        }
        if (!candidates.length) { failed = true; break; }
        const capitalShips = this.ships.filter((ship) => (ship.id === "carrier" || ship.id === "battleship") && !ship.sunk);
        const preferredTarget = id === "escortBravo" ? "battleship" : "carrier";
        const preferredCapital = capitalShips.find((ship) => ship.id === preferredTarget);
        const linked = isEscort(id) && capitalShips.length
          ? candidates.filter(({ start, orientation }) => {
              const escortCells = this.cellsFor(start, def.size, orientation, id);
              const eligibleCapitals = preferredCapital ? [preferredCapital] : capitalShips;
              return eligibleCapitals.some((capitalShip) => escortCells.every((escortCell) =>
                capitalShip.cells.some((capitalCell) => Math.abs(escortCell.x - capitalCell.x) + Math.abs(escortCell.y - capitalCell.y) === 1),
              ));
            })
          : [];
        const choice = rng.pick(linked.length ? linked : candidates);
        if (!choice || !this.placeShip(def.id, choice.start, choice.orientation)) { failed = true; break; }
      }
      if (failed) continue;
      if (requireDualScreen && (!hasEscortLink(this) || !hasFireControlLink(this))) continue;
      return;
    }
    throw new Error("Unable to produce a legal fleet deployment.");
  }
  shipAt(coord: Coord) { return this.ships.find((ship) => ship.cells.some((c) => sameCoord(c, coord))); }
  relocateShip(id: ShipId, rng: SeededRandom, options: RelocationOptions = {}) {
    const ship = this.ships.find((candidate) => candidate.id === id && !candidate.sunk);
    if (!ship) return null;
    const definition = SHIPS.find((candidate) => candidate.id === id)!;
    const current = new Set(ship.cells.map(keyOf));
    const blocked = new Set(options.blocked?.map(keyOf) ?? []);
    const radar = new Set(this.visibleRadarCells().map(keyOf));
    const candidatesFor = (respectSignals: boolean) => {
      const result: Array<{ start: Coord; orientation: Orientation; cells: Coord[] }> = [];
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) for (const orientation of ORIENTATIONS) {
        const start = { x, y };
        const cells = this.cellsFor(start, definition.size, orientation, id);
        if (!cells.every(inBounds) || !cells.every((cell) => this.shots[cell.y][cell.x] === "unknown")) continue;
        if (cells.some((cell) => current.has(keyOf(cell)))) continue;
        if (respectSignals && cells.some((cell) => blocked.has(keyOf(cell)) || radar.has(keyOf(cell)))) continue;
        if (cells.some((cell) => this.ships.some((other) => other !== ship && other.cells.some((occupied) => sameCoord(occupied, cell))))) continue;
        result.push({ start, orientation, cells });
      }
      return result;
    };
    let candidates = candidatesFor(true);
    if (!candidates.length && options.relaxSignalBlocksWhenTrapped) candidates = candidatesFor(false);
    if (!candidates.length && options.resolveContainmentWhenTrapped) {
      ship.sunk = true;
      ship.cells.forEach((cell) => { this.shots[cell.y][cell.x] = "sunk"; });
      return { ...ship.cells[0] };
    }
    if (!candidates.length) return null;
    const choice = rng.pick(candidates);
    if (options.leaveLastKnown) {
      ship.cells.forEach((cell) => {
        if (this.shots[cell.y][cell.x] === "hit") this.shots[cell.y][cell.x] = "lost";
      });
    }
    ship.cells = choice.cells;
    ship.orientation = choice.orientation;
    ship.critical = criticalCoordFor(id, choice.start, choice.orientation);
    return { ...choice.start };
  }
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
    const criticalHit = sameCoord(coord, ship.critical);
    if (ship.hits.size === ship.size) {
      ship.sunk = true;
      ship.cells.forEach((c) => { this.shots[c.y][c.x] = "sunk"; });
      return { coord, kind: "SUNK", shipId: ship.id, shipName: ship.name, revealed: ship.cells.map((c) => ({ ...c })), criticalHit };
    }
    return criticalHit ? { coord, kind: "HIT", shipId: ship.id, shipName: ship.name, criticalHit: true } : { coord, kind: "HIT" };
  }
  hasLiveNeighbor(coord: Coord) {
    for (const dir of ECHO_DIRECTIONS) {
      const ship = this.shipAt({ x: coord.x + dir.x, y: coord.y + dir.y });
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
  allPlaced(fleet: ShipId[] = STANDARD_FLEET) { return fleet.every((id) => this.ships.some((ship) => ship.id === id)); }
  allSunk() { return this.ships.length > 0 && this.ships.every((ship) => ship.sunk); }
  alive(id: ShipId) { const ship = this.ships.find((candidate) => candidate.id === id); return !!ship && !ship.sunk; }
  damageCount() { return this.ships.reduce((n, ship) => n + ship.hits.size, 0); }
}

export function harpoonCells(center: Coord) { return HARPOON_PATTERN.map((o) => ({ x: center.x + o.x, y: center.y + o.y })).filter(inBounds); }
export function radarCells(origin: Coord) { return [{ x: origin.x, y: origin.y }, { x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 }, { x: origin.x + 1, y: origin.y + 1 }].filter(inBounds); }
export function straddleCells(anchor: Coord, orientation: Orientation) {
  const offsets: Record<Orientation, ReadonlyArray<Coord>> = {
    north: [{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }],
    east: [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    south: [{ x: 0, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    west: [{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: -1, y: 0 }, { x: -1, y: 1 }],
  };
  return offsets[orientation].map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y })).filter(inBounds);
}
function hasEscortLinkTo(board: Board, targetId: "carrier" | "battleship") {
  const target = board.ships.find((ship) => ship.id === targetId && !ship.sunk);
  const escorts = board.ships.filter((ship) => isEscort(ship.id) && !ship.sunk);
  return Boolean(target && escorts.some((escort) => escort.cells.every((escortCell) =>
    target.cells.some((targetCell) => Math.abs(escortCell.x - targetCell.x) + Math.abs(escortCell.y - targetCell.y) === 1),
  )));
}

export function escortLinksFor(board: Board, escortId: ShipId) {
  const escort = board.ships.find((ship) => ship.id === escortId && isEscort(ship.id) && !ship.sunk);
  if (!escort) return { carrier: false, battleship: false };
  const linked = (targetId: "carrier" | "battleship") => {
    const target = board.ships.find((ship) => ship.id === targetId && !ship.sunk);
    return Boolean(target && escort.cells.every((escortCell) =>
      target.cells.some((targetCell) => Math.abs(escortCell.x - targetCell.x) + Math.abs(escortCell.y - targetCell.y) === 1),
    ));
  };
  return { carrier: linked("carrier"), battleship: linked("battleship") };
}

export function hasEscortLink(board: Board) { return hasEscortLinkTo(board, "carrier"); }
export function hasFireControlLink(board: Board) { return hasEscortLinkTo(board, "battleship"); }

export class Arsenal {
  uses = { ...WEAPON_MAX };
  reset() { this.uses = { ...WEAPON_MAX }; }
  maxUses(id: keyof typeof WEAPON_MAX, board: Board) {
    if (id === "phantom") return hasEscortLink(board) ? WEAPON_MAX.phantom : 1;
    if (id === "harpoon") return hasFireControlLink(board) ? WEAPON_MAX.harpoon : 2;
    return WEAPON_MAX[id];
  }
  availableUses(id: keyof typeof WEAPON_MAX, board: Board) {
    if (id === "phantom" || id === "harpoon") {
      const spent = WEAPON_MAX[id] - this.uses[id];
      return Math.max(0, this.maxUses(id, board) - spent);
    }
    return this.uses[id];
  }
  canUse(id: keyof typeof WEAPON_MAX, board: Board) {
    const carrier = id === "phantom" ? "carrier" : id === "harpoon" ? "battleship" : id === "sparrow" ? "cruiser" : id === "mk45" ? "destroyer" : "submarine";
    return this.availableUses(id, board) > 0 && board.alive(carrier);
  }
  spend(id: keyof typeof WEAPON_MAX, board: Board) { if (!this.canUse(id, board)) return false; this.uses[id]--; return true; }
}
