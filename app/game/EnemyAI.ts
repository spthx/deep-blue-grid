import { GRID_SIZE, SHIPS, type Coord, type ShipId } from "./constants.ts";
import { Arsenal, Board, SeededRandom, harpoonCells, inBounds, keyOf, radarCells, sparrowCells, type AttackResult, type ShotMark } from "./engine.ts";
import { submarineWakeCandidates } from "./SubmarineWake.ts";

export type AIState = "HUNT" | "TARGET" | "SEARCH";
export type AIProfile = "casual" | "tactics";
export type AIDecision = { weapon: "fire" | "phantom" | "harpoon" | "sparrow" | "mk45" | "radar"; targets: Coord[]; state: AIState };

export class EnemyAI {
  state: AIState = "HUNT";
  knowledge: ShotMark[][] = Array.from({ length: GRID_SIZE }, () => Array<ShotMark>(GRID_SIZE).fill("unknown"));
  arsenal = new Arsenal();
  targetHits: Coord[] = [];
  search: Coord[] = [];
  turnsWithoutHit = 0;
  sunkSizes: number[] = [];
  wakeSignals: Coord[] = [];
  private rng: SeededRandom;
  private targetFleet: ShipId[];
  private sunkShipIds: ShipId[] = [];
  private skill: number;
  private profile: AIProfile;
  constructor(rng: SeededRandom, fleet: ShipId[] = SHIPS.map((ship) => ship.id), skill = 1, profile: AIProfile = "casual") {
    this.rng = rng;
    this.targetFleet = [...fleet];
    this.skill = skill;
    this.profile = profile;
  }

  decide(ownBoard: Board): AIDecision {
    const unknown = this.unknownCells();
    const radarPatience = this.profile === "tactics" ? 2 : this.skill >= 1.25 ? 3 : 4;
    const tacticsPressure = this.profile === "tactics" ? 1.2 : 1;
    if (this.turnsWithoutHit >= radarPatience && this.arsenal.canUse("radar", ownBoard)) {
      const origin = this.bestRadarOrigin();
      this.arsenal.spend("radar", ownBoard);
      return { weapon: "radar", targets: [origin], state: this.state };
    }
    if (this.arsenal.canUse("phantom", ownBoard) && this.turnsWithoutHit >= 1 && this.rng.next() < .18 * this.skill * tacticsPressure) {
      this.arsenal.spend("phantom", ownBoard);
      return { weapon: "phantom", targets: this.rankCandidates().slice(0, 4), state: this.state };
    }
    if ((this.targetHits.length || this.search.length) && this.arsenal.canUse("sparrow", ownBoard) && this.rng.next() < .24 * this.skill * tacticsPressure) {
      this.arsenal.spend("sparrow", ownBoard);
      return { weapon: "sparrow", targets: sparrowCells(this.bestAreaOrigin()).filter((c) => this.isUnknown(c)), state: this.state };
    }
    if (this.targetHits.length && this.arsenal.canUse("harpoon", ownBoard) && this.rng.next() < .32 * this.skill * tacticsPressure) {
      this.arsenal.spend("harpoon", ownBoard);
      return { weapon: "harpoon", targets: harpoonCells(this.bestHarpoonCenter()).filter((c) => this.isUnknown(c)), state: "TARGET" };
    }
    if (this.turnsWithoutHit >= 2 && this.arsenal.canUse("mk45", ownBoard) && unknown.length > 1 && this.rng.next() < .4 * this.skill * tacticsPressure) {
      this.arsenal.spend("mk45", ownBoard);
      const ranked = this.rankCandidates();
      return { weapon: "mk45", targets: ranked.slice(0, 2), state: this.state };
    }
    const target = this.chooseShot();
    return { weapon: "fire", targets: [target], state: this.state };
  }

  observe(results: AttackResult[]) {
    let hit = false;
    for (const result of results) {
      if (result.kind === "ALREADY") continue;
      this.knowledge[result.coord.y][result.coord.x] = result.kind === "MISS" ? "miss" : result.kind === "ECHO" ? "echo" : result.kind === "HIT" ? "hit" : "sunk";
      if (result.kind === "HIT") { hit = true; this.targetHits.push(result.coord); this.addCardinals(result.coord, this.search); }
      if (result.kind === "ECHO") this.addNeighbors(result.coord, this.search);
      if (result.kind === "SUNK") {
        hit = true;
        result.revealed?.forEach((c) => { this.knowledge[c.y][c.x] = "sunk"; });
        if (result.revealed) this.sunkSizes.push(result.revealed.length);
        if (result.shipId && !this.sunkShipIds.includes(result.shipId)) this.sunkShipIds.push(result.shipId);
        else if (result.revealed) {
          const inferred = this.targetFleet.find((id) => !this.sunkShipIds.includes(id) && SHIPS.find((ship) => ship.id === id)!.size === result.revealed!.length);
          if (inferred) this.sunkShipIds.push(inferred);
        }
        const sunkKeys = new Set(result.revealed?.map(keyOf));
        this.targetHits = this.targetHits.filter((c) => !sunkKeys.has(keyOf(c)));
        this.search = this.search.filter((c) => this.knowledge[c.y][c.x] === "unknown");
      }
    }
    this.turnsWithoutHit = hit ? 0 : this.turnsWithoutHit + 1;
    this.updateState();
  }

  observeRadar(origin: Coord, contact: boolean) {
    if (contact) radarCells(origin).forEach((c) => { if (this.knowledge[c.y][c.x] === "unknown") this.search.push(c); });
    this.turnsWithoutHit = contact ? Math.max(0, this.turnsWithoutHit - 2) : this.turnsWithoutHit + 1;
    this.updateState();
  }

  observeWake(wave: Coord) {
    if (!this.wakeSignals.some((seen) => keyOf(seen) === keyOf(wave))) this.wakeSignals.push({ ...wave });
    const candidates = this.rng.shuffle(submarineWakeCandidates(this.wakeSignals).filter((coord) => this.isUnknown(coord)));
    const candidateKeys = new Set(candidates.map(keyOf));
    this.search = [...candidates, ...this.search.filter((coord) => !candidateKeys.has(keyOf(coord)))];
    this.updateState();
  }

  private chooseShot() {
    const targets = this.rankTargetCandidates();
    if (targets.length) { this.state = "TARGET"; return targets[0]; }
    while (this.search.length) { const c = this.search.shift()!; if (this.isUnknown(c)) { this.state = this.targetHits.length ? "TARGET" : "SEARCH"; return c; } }
    this.state = "HUNT";
    return this.rankCandidates()[0];
  }
  private rankTargetCandidates() {
    if (!this.targetHits.length) return [];
    const scores = this.placementScores(true);
    const ranked = [...scores.entries()]
      .filter(([key]) => {
        const [x, y] = key.split(",").map(Number);
        return this.isUnknown({ x, y });
      })
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      });
    if (ranked.length) return ranked;
    return this.targetHits.flatMap((coord) => this.cardinals(coord)).filter((coord) => this.isUnknown(coord));
  }
  private rankCandidates() {
    const remaining = this.remainingFleet();
    const submarineOnly = remaining.every((id) => SHIPS.find((ship) => ship.id === id)!.size === 1);
    const placementScores = this.placementScores(false);
    const scored = this.unknownCells().map((coord) => {
      let score = (placementScores.get(keyOf(coord)) ?? 0) + this.rng.next() * .4;
      if (!submarineOnly && (coord.x + coord.y) % 2 === 0) score += 2;
      for (const echo of this.findMarks("echo")) if (Math.abs(echo.x - coord.x) <= 1 && Math.abs(echo.y - coord.y) <= 1) score += 4;
      return { coord, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.coord);
  }
  private remainingFleet() {
    return this.targetFleet.filter((id) => !this.sunkShipIds.includes(id));
  }
  private placementsFor(id: ShipId) {
    const ship = SHIPS.find((candidate) => candidate.id === id)!;
    const dimensions = ship.width === ship.height
      ? [[ship.width, ship.height]]
      : [[ship.width, ship.height], [ship.height, ship.width]];
    const placements: Coord[][] = [];
    for (const [width, height] of dimensions) for (let y = 0; y <= GRID_SIZE - height; y++) for (let x = 0; x <= GRID_SIZE - width; x++) {
      const cells: Coord[] = [];
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) cells.push({ x: x + dx, y: y + dy });
      if (cells.every((cell) => !["miss", "echo", "sunk"].includes(this.knowledge[cell.y][cell.x]))) placements.push(cells);
    }
    return placements;
  }
  private placementScores(targetOnly: boolean) {
    const scores = new Map<string, number>();
    for (const id of this.remainingFleet()) for (const cells of this.placementsFor(id)) {
      const coveredHits = cells.filter((cell) => this.knowledge[cell.y][cell.x] === "hit").length;
      if (targetOnly && coveredHits === 0) continue;
      const weight = targetOnly ? coveredHits * coveredHits * 20 : 1 + coveredHits * coveredHits * 8;
      for (const cell of cells) if (this.isUnknown(cell)) scores.set(keyOf(cell), (scores.get(keyOf(cell)) ?? 0) + weight);
    }
    return scores;
  }
  private bestRadarOrigin() {
    const options: Array<{ c: Coord; score: number }> = [];
    for (let y = 0; y < GRID_SIZE - 1; y++) for (let x = 0; x < GRID_SIZE - 1; x++) {
      const c = { x, y }; const cells = radarCells(c); const score = cells.filter((p) => this.isUnknown(p)).length + this.rng.next();
      options.push({ c, score });
    }
    return options.sort((a, b) => b.score - a.score)[0].c;
  }
  private bestAreaOrigin() {
    const options: Array<{ c: Coord; score: number }> = [];
    for (let y = 0; y < GRID_SIZE - 1; y++) for (let x = 0; x < GRID_SIZE - 1; x++) {
      const c = { x, y }; const cells = sparrowCells(c);
      const score = cells.filter((p) => this.isUnknown(p)).length + cells.filter((p) => this.search.some((s) => keyOf(s) === keyOf(p))).length * 3 + this.rng.next();
      options.push({ c, score });
    }
    return options.sort((a, b) => b.score - a.score)[0].c;
  }
  private bestHarpoonCenter() {
    const anchor = this.targetHits[0] ?? this.rankCandidates()[0];
    const choices = [{ ...anchor }, ...this.cardinals(anchor)].filter(inBounds);
    return choices.sort((a, b) => harpoonCells(b).filter((c) => this.isUnknown(c)).length - harpoonCells(a).filter((c) => this.isUnknown(c)).length)[0];
  }
  private updateState() { this.state = this.targetHits.length ? "TARGET" : this.search.some((c) => this.isUnknown(c)) ? "SEARCH" : "HUNT"; }
  private unknownCells() { const out: Coord[] = []; for (let y=0;y<GRID_SIZE;y++) for(let x=0;x<GRID_SIZE;x++) if(this.knowledge[y][x]==="unknown") out.push({x,y}); return out; }
  private findMarks(mark: ShotMark) { const out: Coord[] = []; for (let y=0;y<GRID_SIZE;y++) for(let x=0;x<GRID_SIZE;x++) if(this.knowledge[y][x]===mark) out.push({x,y}); return out; }
  private isUnknown(c: Coord) { return inBounds(c) && this.knowledge[c.y][c.x] === "unknown"; }
  private cardinals(c: Coord) { return [{x:c.x+1,y:c.y},{x:c.x-1,y:c.y},{x:c.x,y:c.y+1},{x:c.x,y:c.y-1}].filter(inBounds); }
  private addCardinals(c: Coord, list: Coord[]) { list.push(...this.rng.shuffle(this.cardinals(c)).filter((p) => this.isUnknown(p))); }
  private addNeighbors(c: Coord, list: Coord[]) { for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) { const p={x:c.x+dx,y:c.y+dy}; if((dx||dy)&&this.isUnknown(p)) list.push(p); } this.rng.shuffle(list); }
}
