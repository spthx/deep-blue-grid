import assert from "node:assert/strict";
import test from "node:test";
import { SHIPS, STAGES } from "../app/game/constants.ts";
import { Arsenal, Board, SeededRandom, criticalCoordFor, harpoonCells, radarCells, sparrowCells } from "../app/game/engine.ts";
import { EnemyAI } from "../app/game/EnemyAI.ts";
import { nextSubmarineWake, submarineWakeCandidates } from "../app/game/SubmarineWake.ts";
import { FULL_FLEET, aiSkillFor, playerFleetFor, survivingFleet, usesTacticsRules } from "../app/game/Campaign.ts";
import { commandAssessment, formatElapsed, formatLocal, formatZulu } from "../app/game/AfterAction.ts";

test("campaign is condensed to six escalating stages", () => {
  assert.equal(STAGES.length, 6);
  assert.deepEqual(STAGES.map((stage) => stage.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(STAGES.map((stage) => stage.fleet.length), [3, 4, 5, 5, 6, 6]);
  assert.ok(STAGES.every((stage, index) => index === 0 || stage.aiSkill > STAGES[index - 1].aiSkill));
});

test("stage five eases tactics and survival AI without changing casual or the final stage", () => {
  assert.equal(aiSkillFor("casual", 5, 1.1), 1.1 * 1.38);
  assert.equal(aiSkillFor("tactics", 5, 1.1), 1.819);
  assert.equal(aiSkillFor("survival", 5, 1.1), 1.819);
  assert.equal(aiSkillFor("tactics", 4, 1.05), 1.05 * 1.7);
  assert.equal(aiSkillFor("tactics", 6, 1.16), 1.16 * 1.7);
});

test("after-action timestamps use minute-precision Zulu and local time", () => {
  const timestamp = Date.UTC(2026, 6, 18, 12, 43, 8);
  assert.equal(formatZulu(timestamp), "1243Z");
  assert.match(formatLocal(timestamp), /^\d{4}$/);
  assert.equal(formatElapsed(timestamp, timestamp + 8 * 60000 + 55000), "00:08");
});

test("command assessment reports facts and avoids accusatory language", () => {
  const report = commandAssessment({
    enemyRemainingShips: 1, enemyRemainingCells: 2, accuracy: 38, shots: 21,
    specialUsed: 2, unusedSpecials: [{ label: "HARPOON", uses: 1 }], firstLoss: "carrier",
    identified: 2, enemyTotalShips: 6, identificationRules: true,
  });
  assert.deepEqual(report.facts[0], { label: "敵残存戦力", value: "1艦 / 2区画" });
  assert.match(report.finding, /敵艦隊、残存2区画/);
  assert.match(report.finding, /航空打撃能力を喪失/);
  assert.match(report.finding, /再検討|余地あり/);
  assert.doesNotMatch(report.finding, /失敗|判断ミス|あなた/);
});

test("command assessment changes its finding for prolonged low-accuracy searches", () => {
  const report = commandAssessment({
    enemyRemainingShips: 3, enemyRemainingCells: 8, accuracy: 18, shots: 22,
    specialUsed: 0, unusedSpecials: [{ label: "SPS-10", uses: 2 }], firstLoss: "battleship",
    identified: 0, enemyTotalShips: 5, identificationRules: false,
  });
  assert.match(report.finding, /索敵射撃、命中率18%/);
  assert.match(report.finding, /候補海域圧縮/);
});

test("survival assessment recognizes cumulative losses and a near victory under disadvantage", () => {
  const report = commandAssessment({
    enemyRemainingShips: 1, enemyRemainingCells: 2, accuracy: 41, shots: 29,
    specialUsed: 1, unusedSpecials: [], firstLoss: "battleship",
    identified: 3, enemyTotalShips: 6, identificationRules: true,
    survival: {
      playerEntryShips: 2, playerEntryCells: 5, enemyEntryShips: 6, enemyEntryCells: 20,
      previousLosses: ["carrier", "cruiser", "escort", "submarine"],
    },
  });
  assert.deepEqual(report.facts[0], { label: "作戦開始戦力", value: "自軍 2艦・5区画 / 敵軍 6艦・20区画" });
  assert.deepEqual(report.facts[1], { label: "累積損耗", value: "4艦：空母 / 巡洋艦 / 護衛艦 / 潜水艦" });
  assert.match(report.finding, /作戦開始時より敵側優勢/);
  assert.match(report.finding, /敵艦隊戦力の大半を減殺/);
  assert.doesNotMatch(report.finding, /再検討|投入.*余地/);
});

test("survival assessment records limited results without blaming an outmatched fleet", () => {
  const report = commandAssessment({
    enemyRemainingShips: 6, enemyRemainingCells: 17, accuracy: 20, shots: 15,
    specialUsed: 0, unusedSpecials: [], firstLoss: "destroyer",
    identified: 0, enemyTotalShips: 6, identificationRules: true,
    survival: {
      playerEntryShips: 2, playerEntryCells: 4, enemyEntryShips: 6, enemyEntryCells: 20,
      previousLosses: ["carrier", "battleship", "cruiser", "submarine"],
    },
  });
  assert.match(report.finding, /敵艦隊、3区画損傷/);
  assert.match(report.finding, /戦闘能力低下を確認/);
  assert.doesNotMatch(report.finding, /減殺/);
  assert.match(report.finding, /作戦続行不能/);
  assert.doesNotMatch(report.finding, /再検討|判断ミス|失敗/);
});

test("survival starts with every ship and permanently removes sunk ships", () => {
  assert.equal(FULL_FLEET.length, SHIPS.length);
  assert.deepEqual(playerFleetFor("survival", STAGES[0].fleet, FULL_FLEET), FULL_FLEET);
  const remaining = survivingFleet(FULL_FLEET, ["battleship", "submarine"]);
  assert.equal(remaining.includes("battleship"), false);
  assert.equal(remaining.includes("submarine"), false);
  assert.equal(remaining.length, FULL_FLEET.length - 2);
  assert.equal(usesTacticsRules("survival"), true);
});

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
  assert.equal(horizontal.placeShip("carrier", { x: 4, y: 6 }, "east"), true);
  assert.equal(horizontal.ships[0].cells.length, 8);
  assert.equal(new Set(horizontal.ships[0].cells.map((cell) => cell.y)).size, 2);
  const vertical = new Board();
  assert.equal(vertical.placeShip("carrier", { x: 6, y: 4 }, "south"), true);
  assert.equal(new Set(vertical.ships[0].cells.map((cell) => cell.x)).size, 2);
  assert.equal(vertical.placeShip("destroyer", { x: 6, y: 4 }, "east"), false);
  assert.equal(new Board().placeShip("carrier", { x: 5, y: 7 }, "east"), false);
});

test("critical sections rotate with ships and identify without bonus damage", () => {
  const horizontal = new Board(); horizontal.placeShip("carrier", { x: 1, y: 1 }, "east");
  const vertical = new Board(); vertical.placeShip("carrier", { x: 1, y: 1 }, "south");
  assert.deepEqual(horizontal.ships[0].critical, criticalCoordFor("carrier", { x: 1, y: 1 }, "east"));
  assert.deepEqual(horizontal.ships[0].critical, { x: 3, y: 1 });
  assert.deepEqual(vertical.ships[0].critical, { x: 2, y: 3 });
  const report = horizontal.attack(horizontal.ships[0].critical);
  assert.equal(report.kind, "HIT");
  assert.equal(report.criticalHit, true);
  assert.equal(report.shipId, "carrier");
  assert.equal(horizontal.ships[0].hits.size, 1);
  const ordinary = horizontal.attack({ x: 1, y: 1 });
  assert.equal(ordinary.kind, "HIT");
  assert.equal(ordinary.shipId, undefined);
});

test("four facing directions rotate asymmetric critical sections through a full circle", () => {
  const start = { x: 1, y: 1 };
  assert.deepEqual(criticalCoordFor("carrier", start, "east"), { x: 3, y: 1 });
  assert.deepEqual(criticalCoordFor("carrier", start, "south"), { x: 2, y: 3 });
  assert.deepEqual(criticalCoordFor("carrier", start, "west"), { x: 2, y: 2 });
  assert.deepEqual(criticalCoordFor("carrier", start, "north"), { x: 1, y: 2 });
  assert.deepEqual(criticalCoordFor("cruiser", start, "east"), { x: 3, y: 1 });
  assert.deepEqual(criticalCoordFor("cruiser", start, "west"), { x: 2, y: 1 });
});

test("the one-cell submarine identifies and sinks on the same critical hit", () => {
  const board = new Board(); board.placeShip("submarine", { x: 4, y: 5 }, "east");
  const report = board.attack({ x: 4, y: 5 });
  assert.equal(report.kind, "SUNK");
  assert.equal(report.criticalHit, true);
  assert.equal(report.shipId, "submarine");
});

test("placement rejects overlap, duplicates, and out of bounds", () => {
  const b = new Board();
  assert.equal(b.placeShip("battleship", { x: 4, y: 0 }, "east"), false);
  assert.equal(b.placeShip("battleship", { x: 0, y: 0 }, "east"), true);
  assert.equal(b.placeShip("battleship", { x: 0, y: 2 }, "east"), false);
  assert.equal(b.placeShip("destroyer", { x: 0, y: 0 }, "south"), false);
  assert.equal(b.placeShip("destroyer", { x: 7, y: 5 }, "south"), true);
});

test("a placed ship can be picked up for deliberate repositioning", () => {
  const board = new Board();
  board.placeShip("destroyer", { x: 1, y: 1 }, "east");
  const removed = board.removeShip("destroyer");
  assert.equal(removed?.id, "destroyer");
  assert.equal(board.ships.length, 0);
  assert.equal(board.placeShip("destroyer", { x: 2, y: 3 }, "south"), true);
});

test("attacks cannot double damage and sink on the final segment", () => {
  const b = new Board(); b.placeShip("destroyer", { x: 1, y: 1 }, "east");
  assert.equal(b.attack({ x: 1, y: 1 }).kind, "HIT");
  assert.equal(b.attack({ x: 1, y: 1 }).kind, "ALREADY");
  assert.equal(b.attack({ x: 2, y: 1 }).kind, "HIT");
  assert.equal(b.attack({ x: 3, y: 1 }).kind, "SUNK");
  assert.equal(b.ships[0].hits.size, 3);
});

test("near miss reports only a generic echo", () => {
  const b = new Board(); b.placeShip("submarine", { x: 3, y: 3 }, "east");
  assert.deepEqual(b.attack({ x: 2, y: 3 }), { coord: { x: 2, y: 3 }, kind: "ECHO" });
  assert.equal(b.attack({ x: 0, y: 0 }).kind, "MISS");
});

test("echo only triggers on the 4 orthogonal neighbors, not diagonals", () => {
  const b = new Board(); b.placeShip("submarine", { x: 3, y: 3 }, "east");
  assert.equal(b.attack({ x: 2, y: 2 }).kind, "MISS");
  assert.equal(b.attack({ x: 4, y: 2 }).kind, "MISS");
  assert.equal(b.attack({ x: 2, y: 4 }).kind, "MISS");
  assert.equal(b.attack({ x: 4, y: 4 }).kind, "MISS");
  assert.equal(b.attack({ x: 3, y: 2 }).kind, "ECHO");
  assert.equal(b.attack({ x: 3, y: 4 }).kind, "ECHO");
  assert.equal(b.attack({ x: 2, y: 3 }).kind, "ECHO");
});

test("wake marks appear beside the final submarine without revealing its cell", () => {
  const board = new Board();
  board.placeShip("battleship", { x: 0, y: 0 }, "east");
  board.placeShip("submarine", { x: 7, y: 7 }, "east");
  const rng = new SeededRandom(77);
  assert.equal(nextSubmarineWake(board, [], rng), null);
  for (let x = 0; x < 5; x++) board.attack({ x, y: 0 });
  const first = nextSubmarineWake(board, [], rng)!;
  const second = nextSubmarineWake(board, [first], rng)!;
  assert.notDeepEqual(first, { x: 7, y: 7 });
  assert.notDeepEqual(second, first);
  assert.ok(Math.abs(first.x - 7) <= 1 && Math.abs(first.y - 7) <= 1);
  assert.ok(submarineWakeCandidates([first, second]).some((coord) => coord.x === 7 && coord.y === 7));
});

test("AI receives the same public submarine wake candidates as the player", () => {
  const own = new Board(); own.placeShip("submarine", { x: 0, y: 0 }, "east");
  const ai = new EnemyAI(new SeededRandom(88), ["submarine"], 1.7, "tactics");
  const wave = { x: 3, y: 3 };
  ai.observeWake(wave);
  const decision = ai.decide(own);
  assert.equal(decision.weapon, "fire");
  assert.ok(Math.abs(decision.targets[0].x - wave.x) <= 1 && Math.abs(decision.targets[0].y - wave.y) <= 1);
  assert.notDeepEqual(decision.targets[0], wave);
});

test("AI finishes a publicly inferred 2 by 4 carrier footprint after five hits", () => {
  const own = new Board(); own.placeShip("submarine", { x: 0, y: 0 }, "east");
  const ai = new EnemyAI(new SeededRandom(91), ["carrier"], 1.7, "tactics");
  ai.arsenal.uses = { phantom: 0, harpoon: 0, sparrow: 0, mk45: 0, radar: 0 };
  const knownHits = [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }];
  ai.observe(knownHits.map((coord) => ({ coord, kind: "HIT" as const })));
  const remaining = new Set(["2,1", "3,1", "4,2"]);
  const decision = ai.decide(own);
  assert.equal(decision.weapon, "fire");
  assert.equal(remaining.has(`${decision.targets[0].x},${decision.targets[0].y}`), true);
});

test("tactics AI records a critical-section identification while casual AI ignores it", () => {
  const report = { coord: { x: 3, y: 2 }, kind: "HIT" as const, criticalHit: true, shipId: "carrier" as const, shipName: "空母" };
  const tactics = new EnemyAI(new SeededRandom(120), ["carrier"], 1.7, "tactics");
  const casual = new EnemyAI(new SeededRandom(120), ["carrier"], 1.2, "casual");
  tactics.observe([report]); casual.observe([report]);
  assert.deepEqual(tactics.identifiedShips.get("carrier"), report.coord);
  assert.equal(casual.identifiedShips.has("carrier"), false);
});

test("weapon patterns clip safely and radar never damages", () => {
  assert.equal(harpoonCells({ x: 4, y: 4 }).length, 5);
  assert.equal(harpoonCells({ x: 0, y: 0 }).length, 2);
  const b = new Board(); b.placeShip("submarine", { x: 1, y: 1 }, "east");
  assert.equal(radarCells({ x: 0, y: 0 }).length, 4);
  assert.equal(b.radar({ x: 0, y: 0 }), true);
  assert.equal(b.ships[0].hits.size, 0);
  assert.equal(sparrowCells({ x: 7, y: 7 }).length, 1);
});

test("radar contact only records unbroken enemy sections", () => {
  const b = new Board(); b.placeShip("destroyer", { x: 1, y: 1 }, "east");
  b.attack({ x: 1, y: 1 });
  assert.equal(b.radar({ x: 0, y: 0 }), false);
  assert.equal(b.radar({ x: 1, y: 1 }), true);
  assert.deepEqual(b.radarScans.map((scan) => scan.contact), [false, true]);
  assert.equal(b.radarScans[0].candidates.some((coord) => coord.x === 1 && coord.y === 1), false);
  assert.equal(b.radarScans[1].candidates.some((coord) => coord.x === 1 && coord.y === 1), false);
});

test("carrier loss disables remaining weapon uses", () => {
  const b = new Board(); b.placeShip("battleship", { x: 0, y: 0 }, "east");
  const arsenal = new Arsenal();
  assert.equal(arsenal.canUse("harpoon", b), true);
  for (let x = 0; x < 5; x++) b.attack({ x, y: 0 });
  assert.equal(arsenal.canUse("harpoon", b), false);
  assert.equal(arsenal.uses.harpoon, 2);
});

test("harpoon keeps two symmetric uses per stage", () => {
  const own = new Board(); own.placeShip("battleship", { x: 0, y: 0 }, "east");
  const arsenal = new Arsenal();
  assert.equal(arsenal.uses.harpoon, 2);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), false);
});

test("escort grants one additional F-4 sortie while both ships survive", () => {
  const own = new Board();
  own.placeShip("carrier", { x: 0, y: 0 }, "east");
  own.placeShip("escort", { x: 0, y: 3 }, "east");
  const arsenal = new Arsenal();
  assert.equal(arsenal.availableUses("phantom", own), 2);
  assert.equal(arsenal.spend("phantom", own), true);
  assert.equal(arsenal.availableUses("phantom", own), 1);
  own.attack({ x: 0, y: 3 }); own.attack({ x: 1, y: 3 });
  assert.equal(arsenal.availableUses("phantom", own), 0);
  assert.equal(arsenal.spend("phantom", own), false);
});

test("carrier keeps one F-4 sortie when no escort is deployed", () => {
  const own = new Board(); own.placeShip("carrier", { x: 0, y: 0 }, "east");
  const arsenal = new Arsenal();
  assert.equal(arsenal.maxUses("phantom", own), 1);
  assert.equal(arsenal.availableUses("phantom", own), 1);
  assert.equal(arsenal.spend("phantom", own), true);
  assert.equal(arsenal.spend("phantom", own), false);
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

test("tactics AI keeps equal supplies and does not use hidden fleet data", () => {
  const fleet = SHIPS.map((ship) => ship.id);
  const ownA = new Board(); ownA.randomize(new SeededRandom(101));
  const ownB = new Board(); ownB.randomize(new SeededRandom(101));
  const a = new EnemyAI(new SeededRandom(202), fleet, 1.7, "tactics");
  const b = new EnemyAI(new SeededRandom(202), fleet, 1.7, "tactics");

  assert.equal(a.arsenal.uses.radar, 2);
  assert.equal(a.arsenal.uses.mk45, 1);
  assert.deepEqual(a.arsenal.uses, new Arsenal().uses);
  for (let turn = 0; turn < 12; turn++) {
    const decisionA = a.decide(ownA);
    const decisionB = b.decide(ownB);
    assert.deepEqual(decisionA, decisionB);
    if (decisionA.weapon === "radar") {
      a.observeRadar(decisionA.targets[0], false);
      b.observeRadar(decisionB.targets[0], false);
    } else {
      const reports = decisionA.targets.map((coord) => ({ coord, kind: "MISS" as const }));
      a.observe(reports);
      b.observe(reports.map((report) => ({ ...report, coord: { ...report.coord } })));
    }
  }
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
