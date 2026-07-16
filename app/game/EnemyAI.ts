import { GRID_SIZE, SHIPS, type Coord } from "./constants.ts";
import { Arsenal, Board, SeededRandom, harpoonCells, inBounds, keyOf, radarCells, type AttackResult, type ShotMark } from "./engine.ts";

export type AIState = "HUNT" | "TARGET" | "SEARCH";
export type AIDecision = { weapon: "fire" | "harpoon" | "mk45" | "radar"; targets: Coord[]; state: AIState };

export class EnemyAI {
  state: AIState = "HUNT";
  knowledge: ShotMark[][] = Array.from({ length: GRID_SIZE }, () => Array<ShotMark>(GRID_SIZE).fill("unknown"));
  arsenal = new Arsenal();
  targetHits: Coord[] = [];
  search: Coord[] = [];
  turnsWithoutHit = 0;
  sunkSizes: number[] = [];
  private rng: SeededRandom;
  constructor(rng: SeededRandom) { this.rng = rng; }

  decide(ownBoard: Board): AIDecision {
    const unknown = this.unknownCells();
    if (this.turnsWithoutHit >= 4 && this.arsenal.canUse("radar", ownBoard)) {
      const origin = this.bestRadarOrigin();
      this.arsenal.spend("radar", ownBoard);
      return { weapon: "radar", targets: [origin], state: this.state };
    }
    if (this.targetHits.length && this.arsenal.canUse("harpoon", ownBoard) && this.rng.next() < .36) {
      this.arsenal.spend("harpoon", ownBoard);
      return { weapon: "harpoon", targets: harpoonCells(this.bestHarpoonCenter()).filter((c) => this.isUnknown(c)), state: "TARGET" };
    }
    if (this.turnsWithoutHit >= 2 && this.arsenal.canUse("mk45", ownBoard) && unknown.length > 1 && this.rng.next() < .44) {
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

  private chooseShot() {
    const targets = this.orientedTargets().filter((c) => this.isUnknown(c));
    if (targets.length) { this.state = "TARGET"; return targets[0]; }
    while (this.search.length) { const c = this.search.shift()!; if (this.isUnknown(c)) { this.state = this.targetHits.length ? "TARGET" : "SEARCH"; return c; } }
    this.state = "HUNT";
    return this.rankCandidates()[0];
  }
  private orientedTargets() {
    if (this.targetHits.length < 2) return this.targetHits.flatMap((c) => this.cardinals(c));
    const sameRow = this.targetHits.every((c) => c.y === this.targetHits[0].y);
    const sameCol = this.targetHits.every((c) => c.x === this.targetHits[0].x);
    if (sameRow) {
      const xs = this.targetHits.map((c) => c.x); return [{ x: Math.min(...xs) - 1, y: this.targetHits[0].y }, { x: Math.max(...xs) + 1, y: this.targetHits[0].y }].filter(inBounds);
    }
    if (sameCol) {
      const ys = this.targetHits.map((c) => c.y); return [{ x: this.targetHits[0].x, y: Math.min(...ys) - 1 }, { x: this.targetHits[0].x, y: Math.max(...ys) + 1 }].filter(inBounds);
    }
    return this.targetHits.flatMap((c) => this.cardinals(c));
  }
  private rankCandidates() {
    const remainingSizes = SHIPS.map((s) => s.size).filter((size) => !this.sunkSizes.includes(size));
    const submarineOnly = remainingSizes.every((s) => s === 1);
    const scored = this.unknownCells().map((coord) => {
      let score = this.rng.next() * .4;
      if (!submarineOnly && (coord.x + coord.y) % 2 === 0) score += 2;
      for (const size of remainingSizes) for (const horizontal of [true, false]) for (let offset = 0; offset < size; offset++) {
        const cells = Array.from({ length: size }, (_, i) => ({ x: coord.x + (horizontal ? i - offset : 0), y: coord.y + (horizontal ? 0 : i - offset) }));
        if (cells.every(inBounds) && cells.every((c) => !["miss", "echo", "sunk"].includes(this.knowledge[c.y][c.x]))) score += 1;
      }
      for (const echo of this.findMarks("echo")) if (Math.abs(echo.x - coord.x) <= 1 && Math.abs(echo.y - coord.y) <= 1) score += 4;
      return { coord, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.coord);
  }
  private bestRadarOrigin() {
    const options: Array<{ c: Coord; score: number }> = [];
    for (let y = 0; y < GRID_SIZE - 1; y++) for (let x = 0; x < GRID_SIZE - 1; x++) {
      const c = { x, y }; const cells = radarCells(c); const score = cells.filter((p) => this.isUnknown(p)).length + this.rng.next();
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
