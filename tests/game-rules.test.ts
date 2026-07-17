import assert from "node:assert/strict";
import test from "node:test";
import { SHIPS, STAGES } from "../app/game/constants.ts";
import { Arsenal, Board, SeededRandom, harpoonCells, radarCells, sparrowCells } from "../app/game/engine.ts";
import { EnemyAI } from "../app/game/EnemyAI.ts";

test("random placement is legal and complete across many seeds", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const board = new Board(); board.randomize(new SeededRandom(seed));
    assert.equal(board.ships.length, SHIPS.length);
    const occupied = board.ships.flatMap((s) => s.cells.map((c) => `${c.x},${c.y}`));
    assert.equal(new Set(occupied).size, SHIPS.reduce((n, s) => n + s.size, 0));
    assert.ok(board.ships.every((s) => s.cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < 8 && c.y < 8)));
  }
});

test("every campaign fleet can be placed legally", () => {
  for (const stage of STAGES) {
    for (let seed = 1; seed <= 30; seed++) {
      const board = new Board();
      board.randomize(new SeededRandom(stage.id * 1000 + seed), stage.fleet);
      assert.equal(board.ships.length, stage.fleet.length);
      assert.equal(board.allPlaced(stage.fleet), true);
      const occupied = board.ships.flatMap((ship) => ship.cells.map((cell) => `${cell.x},${cell.y}`));
      assert.equal(new Set(occupied).size, occupied.length);
    }
  }
});

test("carrier uses a rotatable 2 by 4 footprint", () => {
  const horizontal = new Board();
  assert.equal(horizontal.placeShip("carrier", { x: 4, y: 6 }, "horizontal"), true);
  assert.equal(horizontal.ships[0].cells.length, 8);
  assert.equal(new Set(horizontal.ships[0].cells.map((cell) => cell.y)).size, 2);
  const vertical = new Board();
  assert.equal(vertical.placeShip("carrier", { x: 6, y: 4 }, "vertical"), true);
  assert.equal(new Set(vertical.ships[0].cells.map((cell) => cell.x)).size, 2);
  assert.equal(vertical.placeShip("destroyer", { x: 6, y: 4 }, "horizontal"), false);
  assert.equal(new Board().placeShip("carrier", { x: 5, y: 7 }, "horizontal"), false);
});

test("placement rejects overlap, duplicates, and out of bounds", () => {
  const b = new Board();
  assert.equal(b.placeShip("battleship", { x: 4, y: 0 }, "horizontal"), false);
  assert.equal(b.placeShip("battleship", { x: 0, y: 0 }, "horizontal"), true);
  assert.equal(b.placeShip("battleship", { x: 0, y: 2 }, "horizontal"), false);
  assert.equal(b.placeShip("destroyer", { x: 0, y: 0 }, "vertical"), false);
  assert.equal(b.placeShip("destroyer", { x: 7, y: 5 }, "vertical"), true);
});

test("attacks cannot double damage and sink on the final segment", () => {
  const b = new Board(); b.placeShip("destroyer", { x: 1, y: 1 }, "horizontal");
  assert.equal(b.attack({ x: 1, y: 1 }).kind, "HIT");
  assert.equal(b.attack({ x: 1, y: 1 }).kind, "ALREADY");
  assert.equal(b.attack({ x: 2, y: 1 }).kind, "HIT");
  assert.equal(b.attack({ x: 3, y: 1 }).kind, "SUNK");
  assert.equal(b.ships[0].hits.size, 3);
});

test("near miss reports only a generic echo", () => {
  const b = new Board(); b.placeShip("submarine", { x: 3, y: 3 }, "horizontal");
  assert.deepEqual(b.attack({ x: 2, y: 2 }), { coord: { x: 2, y: 2 }, kind: "ECHO" });
  assert.equal(b.attack({ x: 0, y: 0 }).kind, "MISS");
});

test("weapon patterns clip safely and radar never damages", () => {
  assert.equal(harpoonCells({ x: 4, y: 4 }).length, 5);
  assert.equal(harpoonCells({ x: 0, y: 0 }).length, 2);
  const b = new Board(); b.placeShip("submarine", { x: 1, y: 1 }, "horizontal");
  assert.equal(radarCells({ x: 0, y: 0 }).length, 4);
  assert.equal(b.radar({ x: 0, y: 0 }), true);
  assert.equal(b.ships[0].hits.size, 0);
  assert.equal(sparrowCells({ x: 7, y: 7 }).length, 1);
});

test("carrier loss disables remaining weapon uses", () => {
  const b = new Board(); b.placeShip("battleship", { x: 0, y: 0 }, "horizontal");
  const arsenal = new Arsenal();
  assert.equal(arsenal.canUse("harpoon", b), true);
  for (let x = 0; x < 5; x++) b.attack({ x, y: 0 });
  assert.equal(arsenal.canUse("harpoon", b), false);
  assert.equal(arsenal.uses.harpoon, 2);
});

test("harpoon keeps two symmetric uses per stage", () => {
  const own = new Board(); own.placeShip("battleship", { x: 0, y: 0 }, "horizontal");
  const arsenal = new Arsenal();
  assert.equal(arsenal.uses.harpoon, 2);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), false);
});

test("AI never repeats or leaves the board over a full simulated hunt", () => {
  const target = new Board(); target.randomize(new SeededRandom(30));
  const own = new Board(); own.randomize(new SeededRandom(50));
  const ai = new EnemyAI(new SeededRandom(70)); const attacked = new Set<string>();
  for (let turn = 0; turn < 64 && !target.allSunk(); turn++) {
    const d = ai.decide(own);
    if (d.weapon === "radar") { ai.observeRadar(d.targets[0], target.radar(d.targets[0])); continue; }
    const results = d.targets.map((c) => {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x < 8 && c.y < 8);
      const key = `${c.x},${c.y}`; assert.equal(attacked.has(key), false); attacked.add(key);
      return target.attack(c);
    });
    ai.observe(results);
  }
  assert.ok(attacked.size > 0);
  assert.ok(Object.values(ai.arsenal.uses).every((uses) => uses >= 0));
});

test("seeded AI-vs-AI balance leaves both sides a practical chance", () => {
  let firstWins = 0; const matches = 160;
  for (let seed = 1; seed <= matches; seed++) {
    const aBoard = new Board(); aBoard.randomize(new SeededRandom(seed * 11));
    const bBoard = new Board(); bBoard.randomize(new SeededRandom(seed * 17));
    const a = new EnemyAI(new SeededRandom(seed * 23));
    const b = new EnemyAI(new SeededRandom(seed * 29));
    let aTurn = seed % 2 === 0;
    for (let action = 0; action < 180 && !aBoard.allSunk() && !bBoard.allSunk(); action++) {
      const actor = aTurn ? a : b; const own = aTurn ? aBoard : bBoard; const target = aTurn ? bBoard : aBoard;
      const decision = actor.decide(own);
      if (decision.weapon === "radar") actor.observeRadar(decision.targets[0], target.radar(decision.targets[0]));
      else actor.observe(decision.targets.map((coord) => target.attack(coord)));
      aTurn = !aTurn;
    }
    if (bBoard.allSunk()) firstWins++;
  }
  const firstSideRate = firstWins / matches;
  assert.ok(firstSideRate > .35 && firstSideRate < .65, `balanced win rate: ${firstSideRate}`);
});
