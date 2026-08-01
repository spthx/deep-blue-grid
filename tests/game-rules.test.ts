import assert from "node:assert/strict";
import test from "node:test";
import { GRID_SIZE, SHIPS, STAGES } from "../app/game/constants.ts";
import { Arsenal, Board, SeededRandom, criticalCoordFor, harpoonCells, hasEscortLink, hasFireControlLink, radarCells, straddleCells } from "../app/game/engine.ts";
import { EnemyAI } from "../app/game/EnemyAI.ts";
import { nextSubmarineWake, submarineWakeCandidates } from "../app/game/SubmarineWake.ts";
import { ARCHIVE_MISSIONS, FULL_FLEET, MISSION_LIBRARY, MISSION_STAGES, SURVIVAL_STAGES, aiSkillFor, enemyFleetFor, friendlyStarts, huntBreadthFor, missionFor, missionLibraryFor, missionRuleFor, playerFleetFor, stagesFor, survivingFleet, usesTacticsRules } from "../app/game/Campaign.ts";
import { applyScenarioHits, deployScenarioFleet, evaluateMission, isMissionSonarOrigin, validateMissionLibrary } from "../app/game/MissionRules.ts";
import { commandAssessment, formatElapsed, formatLocal, formatZulu } from "../app/game/AfterAction.ts";
import { OperationRecorder, formatOperationDuration } from "../app/game/OperationRecord.ts";
import { MUSIC_INTERVAL_MS, pulseIntervalForLosses } from "../app/game/AudioManager.ts";

test("campaign is condensed to six escalating stages", () => {
  assert.equal(STAGES.length, 6);
  assert.deepEqual(STAGES.map((stage) => stage.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(STAGES.map((stage) => stage.fleet.length), [3, 4, 5, 5, 6, 6]);
  assert.ok(STAGES.every((stage, index) => index === 0 || stage.aiSkill > STAGES[index - 1].aiSkill));
  assert.equal(STAGES[2].title, "RANGING FIRE");
});

test("ship class codes are distinct from hull sections and new systems have canonical names", () => {
  assert.deepEqual(SHIPS.slice(0, 7).map((ship) => ship.code), ["CV", "BB", "CA", "DD", "DE-01", "DE-02", "SS"]);
  assert.equal(SHIPS.find((ship) => ship.id === "cruiser")?.weapon, "8-INCH STRADDLE");
  assert.equal(SHIPS.find((ship) => ship.id === "submarine")?.weapon, "PASSIVE SONAR");
});

test("campaign stage five eases tactics while survival final returns to stage-four strength", () => {
  assert.equal(aiSkillFor("casual", 5, 1.1), 1.1 * 1.38);
  assert.equal(aiSkillFor("tactics", 5, 1.1), 1.819);
  assert.equal(aiSkillFor("survival", 5, 1.1), 1.819);
  assert.equal(aiSkillFor("tactics", 4, 1.05), 1.05 * 1.7);
  assert.equal(aiSkillFor("tactics", 6, 1.16), 1.16 * 1.7);
  assert.equal(aiSkillFor("survival", 6, 1.16), 1.05 * 1.7);
});

test("survival is a distinct four-operation end-game route", () => {
  assert.equal(stagesFor("casual"), STAGES);
  assert.equal(stagesFor("tactics"), STAGES);
  assert.equal(stagesFor("survival"), SURVIVAL_STAGES);
  assert.deepEqual(SURVIVAL_STAGES.map((stage) => stage.id), [1, 3, 5, 6]);
  assert.deepEqual(SURVIVAL_STAGES.map((stage) => stage.title), ["DOUBLE SCREEN", "RANGING FIRE", "SEA BAT", "DEEP BLUE GRID"]);
  assert.deepEqual(enemyFleetFor("survival", SURVIVAL_STAGES[2]), ["silentSubmarine"]);
  assert.deepEqual(enemyFleetFor("survival", SURVIVAL_STAGES[3]), ["carrier", "battleship", "cruiser", "submarine"]);
  assert.equal(missionFor("survival", SURVIVAL_STAGES[2]).title, "SEA BAT");
  assert.deepEqual(SURVIVAL_STAGES.map((_, index) => huntBreadthFor("survival", index)), [8, 5, 1, 3]);
  assert.equal(huntBreadthFor("tactics", 3), 1);
});

test("mission mode exposes twelve tactical and four archive operations as isolated free choices", () => {
  assert.equal(stagesFor("mission"), MISSION_LIBRARY);
  assert.equal(MISSION_STAGES.length, 12);
  assert.equal(ARCHIVE_MISSIONS.length, 4);
  assert.equal(MISSION_LIBRARY.length, 16);
  assert.equal(missionLibraryFor("standard").length, 12);
  assert.equal(missionLibraryFor("archive").length, 4);
  assert.deepEqual(MISSION_LIBRARY.map((mission) => mission.difficulty), [1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 2, 3, 4, 4]);
  assert.deepEqual(MISSION_LIBRARY.map((mission) => mission.id), [5, 2, 6, 1, 7, 8, 9, 3, 10, 11, 4, 12, 13, 14, 15, 16]);
  const originalFour = [1, 2, 3, 4].map((id) => MISSION_STAGES.find((mission) => mission.id === id)!);
  assert.deepEqual(originalFour.map((mission) => mission.title), [
    "NARROW GATE", "SILENT WATCH", "LAST FLIGHT", "BROKEN SPEAR",
  ]);
  assert.deepEqual(originalFour.map((mission) => mission.allowedWeapons), [
    ["fire", "sparrow", "mk45"],
    ["radar"],
    ["fire", "phantom"],
    ["harpoon"],
  ]);
  assert.deepEqual(originalFour.map((mission) => mission.fixedSeed), [
    0x4d0101, 0x4d0202, 0x4d0303, 0x4d0404,
  ]);
  assert.deepEqual(originalFour.map((mission) => mission.objective.maxFriendlyActions), [3, 2, 2, 3]);
  assert.deepEqual(originalFour.map((mission) => friendlyStarts("mission", mission)), [true, false, false, true]);
  assert.deepEqual(MISSION_LIBRARY.map((_, index) => huntBreadthFor("mission", index)), MISSION_LIBRARY.map((mission) => mission.huntBreadth));
  assert.equal(usesTacticsRules("mission"), true);
  assert.equal(aiSkillFor("mission", originalFour[3].id, originalFour[3].aiSkill), 1.819);
  assert.deepEqual(playerFleetFor("mission", originalFour[0], FULL_FLEET), ["cruiser", "destroyer"]);
  assert.deepEqual(enemyFleetFor("mission", originalFour[0]), ["battleship", "destroyer", "escort", "submarine"]);
  assert.equal(missionRuleFor("casual", originalFour[0]), null);
  assert.equal(missionRuleFor("tactics", originalFour[0]), null);
  assert.equal(missionRuleFor("survival", originalFour[0]), null);
  assert.deepEqual(validateMissionLibrary(MISSION_LIBRARY), []);
  assert.equal(friendlyStarts("casual", STAGES[0]), true);
  assert.equal(friendlyStarts("tactics", STAGES[0]), false);
  assert.equal(friendlyStarts("survival", SURVIVAL_STAGES[0]), false);
});

test("all mission placements, initial hits, intelligence, and wakes are fixed and legal", () => {
  const originalExpectedInitialHits = new Map<number, string[]>([
    [1, ["C-4"]], [2, []], [3, ["D-4"]], [4, ["C-3", "C-5"]],
  ]);
  const display = ({ x, y }: { x: number; y: number }) => `${String.fromCharCode(65 + y)}-${x + 1}`;

  for (const mission of MISSION_LIBRARY) {
    const friendly = new Board();
    const hostile = new Board();
    deployScenarioFleet(friendly, mission.playerPlacements);
    deployScenarioFleet(hostile, mission.enemyPlacements);

    for (const [board, fleet] of [[friendly, mission.playerFleet], [hostile, mission.enemyFleet]] as const) {
      assert.equal(board.allPlaced(fleet), true, `${mission.title}: fleet incomplete`);
      const occupied = board.ships.flatMap((ship) => ship.cells.map((cell) => `${cell.x},${cell.y}`));
      assert.equal(new Set(occupied).size, occupied.length, `${mission.title}: placement overlap`);
      assert.ok(board.ships.every((ship) => ship.cells.every((cell) =>
        cell.x >= 0 && cell.y >= 0 && cell.x < GRID_SIZE && cell.y < GRID_SIZE)), `${mission.title}: out of bounds`);
    }

    applyScenarioHits(friendly, mission.playerInitialHits);
    applyScenarioHits(hostile, mission.enemyInitialHits);
    if (originalExpectedInitialHits.has(mission.id)) {
      assert.deepEqual((mission.enemyInitialHits ?? []).map(display), originalExpectedInitialHits.get(mission.id));
    }
    for (const coord of mission.playerInitialHits ?? []) {
      assert.equal(friendly.shots[coord.y][coord.x], "hit", `${mission.title}: missing friendly initial hit`);
    }
    for (const coord of mission.enemyInitialHits ?? []) {
      assert.equal(hostile.shots[coord.y][coord.x], "hit", `${mission.title}: missing hostile initial hit`);
    }
    for (const intel of mission.initialIntel ?? []) {
      assert.equal(hostile.attack(intel.coord).kind.toLowerCase(), intel.mark,
        `${mission.title}: ${display(intel.coord)} intel mismatch`);
    }
    for (const wake of mission.initialEnemyWakes ?? []) {
      assert.ok(wake.x >= 0 && wake.y >= 0 && wake.x < GRID_SIZE && wake.y < GRID_SIZE);
      assert.equal(hostile.shipAt(wake), undefined, `${mission.title}: wake overlaps a ship`);
    }
  }
});

test("NARROW GATE has a deterministic two-order MK-45 and submarine solution", () => {
  const mission = MISSION_STAGES[0];
  const hostile = new Board();
  deployScenarioFleet(hostile, mission.enemyPlacements);
  applyScenarioHits(hostile, mission.enemyInitialHits);

  assert.equal(hostile.attack({ x: 2, y: 2 }).kind, "HIT"); // C-3
  assert.equal(hostile.attack({ x: 4, y: 2 }).kind, "SUNK"); // C-5
  assert.equal(hostile.ships.find((ship) => ship.id === "destroyer")?.sunk, true);
  assert.equal(hostile.attack({ x: 5, y: 5 }).kind, "SUNK"); // F-6

  const outcome = evaluateMission(mission, {
    friendlyActions: 2,
    enemySunk: hostile.ships.filter((ship) => ship.sunk).map((ship) => ship.id),
    friendlyAlive: [...mission.playerFleet],
    sonarReports: [],
  });
  assert.equal(outcome?.result, "victory");
});

test("SILENT WATCH returns the authored ALPHA contact and BRAVO clear report", () => {
  const mission = MISSION_STAGES[1];
  assert.equal(mission.objective.kind, "sonar-reports");
  if (mission.objective.kind !== "sonar-reports") return;
  const hostile = new Board();
  deployScenarioFleet(hostile, mission.enemyPlacements);

  const [alpha, bravo] = mission.objective.reports;
  assert.equal(isMissionSonarOrigin(mission, alpha.origin), true);
  assert.equal(isMissionSonarOrigin(mission, bravo.origin), true);
  assert.equal(isMissionSonarOrigin(mission, { x: 1, y: 1 }), false);
  assert.equal(isMissionSonarOrigin(MISSION_STAGES[0], { x: 1, y: 1 }), true);
  assert.deepEqual(radarCells(alpha.origin), [
    { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 },
  ]);
  assert.equal(hostile.radar(alpha.origin), true);
  assert.equal(hostile.radar(bravo.origin), false);
  assert.equal(evaluateMission(mission, {
    friendlyActions: 2,
    enemySunk: [],
    friendlyAlive: [...mission.playerFleet],
    sonarReports: [
      { origin: { ...alpha.origin }, contact: true },
      { origin: { ...bravo.origin }, contact: false },
    ],
  })?.result, "victory");

  assert.equal(evaluateMission(mission, {
    friendlyActions: 2,
    enemySunk: [],
    friendlyAlive: [...mission.playerFleet],
    sonarReports: [
      { origin: { ...alpha.origin }, contact: true },
      { origin: { ...alpha.origin }, contact: true },
    ],
  })?.result, "defeat");
  assert.equal(evaluateMission(mission, {
    friendlyActions: 2,
    enemySunk: [],
    friendlyAlive: [...mission.playerFleet],
    sonarReports: [
      { origin: { ...alpha.origin }, contact: false },
      { origin: { ...bravo.origin }, contact: false },
    ],
  })?.result, "defeat");
});

test("LAST FLIGHT keeps its escort link and is solvable in at most two Phantom sorties", () => {
  const mission = MISSION_STAGES[2];
  const friendly = new Board();
  deployScenarioFleet(friendly, mission.playerPlacements);
  applyScenarioHits(friendly, mission.playerInitialHits);
  assert.equal(hasEscortLink(friendly), true);
  assert.equal(new Arsenal().maxUses("phantom", friendly), 2);

  const direct = new Board();
  deployScenarioFleet(direct, mission.enemyPlacements);
  applyScenarioHits(direct, mission.enemyInitialHits);
  for (const coord of [{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]) direct.attack(coord);
  assert.equal(direct.ships.find((ship) => ship.id === "battleship")?.sunk, true);

  const alternate = new Board();
  deployScenarioFleet(alternate, mission.enemyPlacements);
  applyScenarioHits(alternate, mission.enemyInitialHits);
  const verticalHypothesis = [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 3, y: 5 }];
  assert.equal(verticalHypothesis.some((coord) => {
    const kind = alternate.attack(coord).kind;
    return kind === "HIT" || kind === "SUNK";
  }), false);
  for (const coord of [{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]) alternate.attack(coord);
  assert.equal(alternate.ships.find((ship) => ship.id === "battleship")?.sunk, true);
});

test("BROKEN SPEAR requires its fire-control link and three canonical HARPOON centers", () => {
  const mission = MISSION_STAGES[3];
  const friendly = new Board();
  deployScenarioFleet(friendly, mission.playerPlacements);
  applyScenarioHits(friendly, mission.playerInitialHits);
  assert.equal(hasFireControlLink(friendly), true);
  assert.equal(new Arsenal().maxUses("harpoon", friendly), 3);

  const hostile = new Board();
  deployScenarioFleet(hostile, mission.enemyPlacements);
  applyScenarioHits(hostile, mission.enemyInitialHits);
  for (const intel of mission.initialIntel ?? []) hostile.attack(intel.coord);
  for (const center of [{ x: 4, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 2 }]) {
    for (const coord of harpoonCells(center)) hostile.attack(coord);
  }
  assert.equal(hostile.ships.find((ship) => ship.id === "carrier")?.sunk, true);
  assert.equal(evaluateMission(mission, {
    friendlyActions: 3,
    enemySunk: ["carrier"],
    friendlyAlive: [...mission.playerFleet],
    sonarReports: [],
  })?.result, "victory");
});

test("mission evaluator gives completed objectives priority, then rejects protected-ship loss", () => {
  const narrowGate = MISSION_STAGES[0];
  assert.equal(evaluateMission(narrowGate, {
    friendlyActions: 3,
    enemySunk: ["destroyer", "submarine"],
    friendlyAlive: [...narrowGate.playerFleet],
    sonarReports: [],
  })?.result, "victory");

  const lastFlight = MISSION_STAGES[2];
  const protectedLoss = evaluateMission(lastFlight, {
    friendlyActions: 1,
    enemySunk: [],
    friendlyAlive: ["escort"],
    sonarReports: [],
  });
  assert.equal(protectedLoss?.result, "defeat");
  assert.match(protectedLoss?.report ?? "", /^FLIGHT CONTROL LOST/);

  const simultaneousTargetAndProtectedLoss = evaluateMission(lastFlight, {
    friendlyActions: 2,
    enemySunk: ["battleship"],
    friendlyAlive: ["escort"],
    sonarReports: [],
  });
  assert.equal(simultaneousTargetAndProtectedLoss?.result, "victory");
  assert.match(simultaneousTargetAndProtectedLoss?.report ?? "", /^TARGET NEUTRALIZED/);

  const silentWatch = MISSION_STAGES[1];
  assert.equal(silentWatch.objective.kind, "sonar-reports");
  if (silentWatch.objective.kind === "sonar-reports") {
    const [alpha, bravo] = silentWatch.objective.reports;
    const completedAfterProtectedLoss = evaluateMission(silentWatch, {
      friendlyActions: 2,
      enemySunk: [],
      friendlyAlive: ["escort"],
      sonarReports: [
        { origin: { ...alpha.origin }, contact: alpha.contact },
        { origin: { ...bravo.origin }, contact: bravo.contact },
      ],
    });
    assert.equal(completedAfterProtectedLoss?.result, "victory");
    assert.match(completedAfterProtectedLoss?.report ?? "", /^ACOUSTIC PICTURE ESTABLISHED/);
  }
});

test("mission retry inputs remain immutable after deployment and combat probes", () => {
  const canonical = structuredClone(MISSION_STAGES);
  for (const mission of MISSION_STAGES) {
    const friendly = new Board();
    const hostile = new Board();
    deployScenarioFleet(friendly, mission.playerPlacements);
    deployScenarioFleet(hostile, mission.enemyPlacements);
    applyScenarioHits(friendly, mission.playerInitialHits);
    applyScenarioHits(hostile, mission.enemyInitialHits);
    hostile.attack({ x: 7, y: 7 });

    const playerCopy = playerFleetFor("mission", mission, FULL_FLEET);
    const enemyCopy = enemyFleetFor("mission", mission);
    playerCopy.reverse();
    enemyCopy.reverse();
  }
  assert.deepEqual(MISSION_STAGES, canonical);
});

test("mission retry reconstructs identical boards, intelligence, supplies, and first enemy order", () => {
  const reconstruct = (missionIndex: number) => {
    const mission = MISSION_STAGES[missionIndex];
    const friendly = new Board();
    const hostile = new Board();
    deployScenarioFleet(friendly, mission.playerPlacements);
    deployScenarioFleet(hostile, mission.enemyPlacements);
    applyScenarioHits(friendly, mission.playerInitialHits);
    applyScenarioHits(hostile, mission.enemyInitialHits);
    for (const intel of mission.initialIntel ?? []) hostile.shots[intel.coord.y][intel.coord.x] = intel.mark;
    const arsenal = new Arsenal();
    const enemyAI = new EnemyAI(
      new SeededRandom(mission.fixedSeed ^ 0x51f15e),
      mission.playerFleet,
      aiSkillFor("mission", mission.id, mission.aiSkill),
      "tactics",
      huntBreadthFor("mission", missionIndex),
    );
    return {
      friendlyShips: friendly.ships.map((ship) => ({ id: ship.id, cells: ship.cells, hits: [...ship.hits] })),
      hostileShips: hostile.ships.map((ship) => ({ id: ship.id, cells: ship.cells, hits: [...ship.hits] })),
      hostileShots: hostile.shots,
      wakes: (mission.initialEnemyWakes ?? []).map((coord) => ({ ...coord })),
      allowedUses: mission.allowedWeapons.filter((weapon) => weapon !== "fire").map((weapon) => ({
        weapon,
        available: arsenal.canUse(weapon, friendly),
        uses: arsenal.availableUses(weapon, friendly),
      })),
      firstEnemyOrder: enemyAI.decide(hostile),
    };
  };

  for (const [index, mission] of MISSION_STAGES.entries()) {
    assert.deepEqual(reconstruct(index), reconstruct(index), mission.title);
    assert.ok(reconstruct(index).allowedUses.every((entry) => entry.available && entry.uses > 0), `${mission.title}: unavailable permitted weapon`);
  }
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
    specialUsed: 0, unusedSpecials: [{ label: "PASSIVE SONAR", uses: 2 }], firstLoss: "battleship",
    identified: 0, enemyTotalShips: 5, identificationRules: false,
  });
  assert.match(report.finding, /捜索射撃、命中率18%/);
  assert.match(report.finding, /敵推定位置の絞り込み/);
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
  assert.equal(FULL_FLEET.length, 6);
  assert.equal(FULL_FLEET.includes("silentSubmarine"), false);
  assert.deepEqual(playerFleetFor("survival", STAGES[0], FULL_FLEET), FULL_FLEET);
  const remaining = survivingFleet(FULL_FLEET, ["battleship", "submarine"]);
  assert.equal(remaining.includes("battleship"), false);
  assert.equal(remaining.includes("submarine"), false);
  assert.equal(remaining.length, FULL_FLEET.length - 2);
  assert.equal(usesTacticsRules("survival"), true);
});

test("operation record preserves failed-attempt damage and retries across four operations", () => {
  const record = new OperationRecorder(["DOUBLE SCREEN", "RANGING FIRE", "SEA BAT", "DEEP BLUE GRID"], 1000);
  record.noteEngagement(0);
  record.noteAction(0, 4, 1, true);
  record.noteDamage(0, 3);
  record.noteRetry(0);
  record.noteEngagement(0);
  record.noteAction(0, 2, 2, false);
  record.noteDamage(0, 1);
  record.completeStage(0, ["destroyer"], 61_000);
  record.beginStage(1, 61_000);
  record.noteEngagement(1);
  record.noteAction(1, 1, 1, false);
  record.completeStage(1, [], 91_000);
  record.pause(91_000);
  record.resume(121_000);
  record.finish(131_000);
  const snapshot = record.snapshot(131_000);
  assert.equal(snapshot.activeMs, 100_000);
  assert.equal(formatOperationDuration(snapshot.activeMs), "00:01:40");
  assert.equal(snapshot.engagements, 3);
  assert.equal(snapshot.retries, 1);
  assert.equal(snapshot.damage, 4);
  assert.equal(snapshot.shots, 7);
  assert.equal(snapshot.hits, 4);
  assert.deepEqual(snapshot.confirmedLosses, ["destroyer"]);
  assert.equal(snapshot.stages[0].completed, true);
  assert.equal(snapshot.stages[0].damage, 4);
});

test("command pulse accelerates monotonically with absolute fleet loss", () => {
  assert.deepEqual(MUSIC_INTERVAL_MS, [260, 240, 220, 200, 185, 170]);
  assert.equal(pulseIntervalForLosses(-2), 260);
  assert.equal(pulseIntervalForLosses(0), 260);
  assert.equal(pulseIntervalForLosses(3), 200);
  assert.equal(pulseIntervalForLosses(99), 170);
  assert.ok(MUSIC_INTERVAL_MS.every((value, index) => index === 0 || value < MUSIC_INTERVAL_MS[index - 1]));
});

test("random placement is legal and complete across many seeds", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const board = new Board(); board.randomize(new SeededRandom(seed));
    assert.equal(board.ships.length, FULL_FLEET.length);
    const occupied = board.ships.flatMap((s) => s.cells.map((c) => `${c.x},${c.y}`));
    assert.equal(new Set(occupied).size, FULL_FLEET.reduce((n, id) => n + SHIPS.find((ship) => ship.id === id)!.size, 0));
    assert.ok(board.ships.every((s) => s.cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < 8 && c.y < 8)));
    assert.equal(hasEscortLink(board) || hasFireControlLink(board), true);
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

test("DOUBLE SCREEN places two distinct escorts and links both capital ships", () => {
  const fleet = SURVIVAL_STAGES[0].fleet;
  assert.deepEqual(fleet, ["carrier", "battleship", "escort", "escortBravo"]);
  for (let seed = 1; seed <= 100; seed++) {
    const board = new Board();
    board.randomize(new SeededRandom(7000 + seed), fleet);
    assert.equal(board.allPlaced(fleet), true);
    assert.equal(board.ships.filter((ship) => ship.id === "escort" || ship.id === "escortBravo").length, 2);
    assert.equal(hasEscortLink(board), true);
    assert.equal(hasFireControlLink(board), true);
    const occupied = board.ships.flatMap((ship) => ship.cells.map((cell) => `${cell.x},${cell.y}`));
    assert.equal(new Set(occupied).size, occupied.length);
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

test("wake marks avoid ships, shot marks, radar marks, and existing wakes", () => {
  const board = new Board();
  board.placeShip("destroyer", { x: 3, y: 3 }, "east");
  board.placeShip("submarine", { x: 4, y: 4 }, "east");
  for (let x = 3; x <= 5; x++) board.attack({ x, y: 3 });
  for (const coord of [{ x: 3, y: 4 }, { x: 5, y: 4 }, { x: 3, y: 5 }]) board.attack(coord);
  board.radar({ x: 4, y: 5 });

  assert.deepEqual(nextSubmarineWake(board, [], new SeededRandom(12)), null);

  board.radarScans = [];
  const existingWake = { x: 4, y: 5 };
  assert.deepEqual(nextSubmarineWake(board, [existingWake], new SeededRandom(12)), { x: 5, y: 5 });
});


test("SEA BAT keeps damage across silent relocation and leaves last-known contact", () => {
  const board = new Board();
  board.placeShip("silentSubmarine", { x: 2, y: 2 }, "east");
  const original = { ...board.ships[0].cells[0] };
  const first = board.attack(original);
  assert.equal(first.kind, "HIT");
  assert.equal(first.criticalHit, true);
  const relocated = board.relocateShip("silentSubmarine", new SeededRandom(5150), { leaveLastKnown: true });
  assert.ok(relocated);
  assert.notDeepEqual(relocated, original);
  assert.equal(board.ships[0].hits.size, 1);
  assert.equal(board.shots[original.y][original.x], "lost");
  assert.equal(board.shots[relocated.y][relocated.x], "unknown");
  const second = board.attack(relocated);
  assert.equal(second.kind, "SUNK");
  assert.equal(second.shipId, "silentSubmarine");
  assert.equal(board.ships[0].sunk, true);
});

test("SEA BAT alternates fire and silent relocation actions", () => {
  const own = new Board();
  own.placeShip("silentSubmarine", { x: 7, y: 7 }, "east");
  const ai = new EnemyAI(new SeededRandom(808), FULL_FLEET, 1.819, "silent");
  const firingAction = ai.decide(own);
  assert.equal(firingAction.weapon, "fire");
  assert.equal(firingAction.actor, "silentSubmarine");
  const silentAction = ai.decide(own);
  assert.equal(silentAction.weapon, "silentMove");
  assert.equal(silentAction.actor, "silentSubmarine");
  const nextFiringAction = ai.decide(own);
  assert.equal(nextFiringAction.weapon, "fire");
  const wake = nextSubmarineWake(own, [], new SeededRandom(909), firingAction.actor);
  assert.ok(wake);
  assert.ok(Math.abs(wake.x - 7) <= 1 && Math.abs(wake.y - 7) <= 1);
  assert.notDeepEqual(wake, { x: 7, y: 7 });
});

test("SEA BAT silent relocation avoids current, shot, radar, wake, and occupied cells", () => {
  const board = new Board();
  board.placeShip("silentSubmarine", { x: 7, y: 7 }, "east");
  board.placeShip("destroyer", { x: 0, y: 0 }, "east");
  board.attack({ x: 3, y: 3 });
  board.radar({ x: 4, y: 4 });
  const wake = { x: 6, y: 6 };
  const original = { ...board.ships.find((ship) => ship.id === "silentSubmarine")!.cells[0] };
  const moved = board.relocateShip("silentSubmarine", new SeededRandom(9292), { blocked: [wake] });
  assert.ok(moved);
  assert.notDeepEqual(moved, original);
  assert.notDeepEqual(moved, wake);
  assert.equal(board.shots[moved.y][moved.x], "unknown");
  assert.equal(board.radarScans.some((scan) => scan.candidates.some((coord) => coord.x === moved.x && coord.y === moved.y)), false);
  assert.equal(board.ships.some((ship) => ship.id !== "silentSubmarine" && ship.cells.some((coord) => coord.x === moved.x && coord.y === moved.y)), false);
});

test("SEA BAT signal overlays cannot soft-lock an otherwise unknown relocation cell", () => {
  const board = new Board();
  const original = { x: 6, y: 6 };
  board.placeShip("silentSubmarine", original, "east");
  const blocked = Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => ({ x, y })),
  ).flat().filter((coord) => coord.x !== original.x || coord.y !== original.y);
  const moved = board.relocateShip("silentSubmarine", new SeededRandom(89), {
    blocked,
    relaxSignalBlocksWhenTrapped: true,
  });
  assert.ok(moved);
  assert.notDeepEqual(moved, original);
});

test("SEA BAT full-board containment resolves instead of becoming unwinnable", () => {
  const board = new Board();
  const lastKnown = { x: 3, y: 3 };
  board.placeShip("silentSubmarine", lastKnown, "east");
  assert.equal(board.attack(lastKnown).kind, "HIT");
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    if (x !== lastKnown.x || y !== lastKnown.y) board.attack({ x, y });
  }
  board.relocateShip("silentSubmarine", new SeededRandom(90), {
    relaxSignalBlocksWhenTrapped: true,
    resolveContainmentWhenTrapped: true,
  });
  assert.equal(board.allSunk(), true);
  assert.equal(board.shots[lastKnown.y][lastKnown.x], "sunk");
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

test("weapon patterns preserve legacy attacks while straddle rotates through four complete directions", () => {
  assert.equal(harpoonCells({ x: 4, y: 4 }).length, 5);
  assert.equal(harpoonCells({ x: 0, y: 0 }).length, 2);
  const b = new Board(); b.placeShip("submarine", { x: 1, y: 1 }, "east");
  assert.equal(radarCells({ x: 0, y: 0 }).length, 4);
  assert.equal(b.radar({ x: 0, y: 0 }), true);
  assert.equal(b.ships[0].hits.size, 0);
  const anchor = { x: 3, y: 3 };
  assert.deepEqual(straddleCells(anchor, "north"), [{ x: 3, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  assert.deepEqual(straddleCells(anchor, "east"), [{ x: 3, y: 3 }, { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 }]);
  assert.deepEqual(straddleCells(anchor, "south"), [{ x: 3, y: 3 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }]);
  assert.deepEqual(straddleCells(anchor, "west"), [{ x: 3, y: 3 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }]);
  assert.equal(straddleCells({ x: 0, y: 0 }, "north").length < 4, true);
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
  assert.equal(arsenal.availableUses("harpoon", b), 2);
  for (let x = 0; x < 5; x++) b.attack({ x, y: 0 });
  assert.equal(arsenal.canUse("harpoon", b), false);
  assert.equal(arsenal.availableUses("harpoon", b), 2);
});

test("harpoon keeps two symmetric uses without a fire-control link", () => {
  const own = new Board(); own.placeShip("battleship", { x: 0, y: 0 }, "east");
  const arsenal = new Arsenal();
  assert.equal(arsenal.maxUses("harpoon", own), 2);
  assert.equal(arsenal.availableUses("harpoon", own), 2);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), false);
});

test("escort fire-control link grants one additional HARPOON shot while both ships survive", () => {
  const own = new Board();
  own.placeShip("battleship", { x: 0, y: 0 }, "east");
  own.placeShip("escort", { x: 1, y: 1 }, "east");
  const arsenal = new Arsenal();
  assert.equal(hasFireControlLink(own), true);
  assert.equal(arsenal.maxUses("harpoon", own), 3);
  assert.equal(arsenal.availableUses("harpoon", own), 3);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.spend("harpoon", own), true);
  assert.equal(arsenal.availableUses("harpoon", own), 1);
  own.attack({ x: 1, y: 1 }); own.attack({ x: 2, y: 1 });
  assert.equal(hasFireControlLink(own), false);
  assert.equal(arsenal.availableUses("harpoon", own), 0);
  assert.equal(arsenal.spend("harpoon", own), false);
});

test("one escort can sustain carrier and battleship bonuses at the same time", () => {
  const own = new Board();
  own.placeShip("carrier", { x: 0, y: 0 }, "east");
  own.placeShip("battleship", { x: 0, y: 3 }, "east");
  own.placeShip("escort", { x: 1, y: 2 }, "east");
  const arsenal = new Arsenal();
  assert.equal(hasEscortLink(own), true);
  assert.equal(hasFireControlLink(own), true);
  assert.equal(arsenal.availableUses("phantom", own), 2);
  assert.equal(arsenal.availableUses("harpoon", own), 3);
});

test("two escorts never stack a capital-ship support bonus above its cap", () => {
  const own = new Board();
  own.placeShip("carrier", { x: 0, y: 0 }, "east");
  own.placeShip("battleship", { x: 0, y: 4 }, "east");
  own.placeShip("escort", { x: 0, y: 2 }, "east");
  own.placeShip("escortBravo", { x: 0, y: 3 }, "east");
  const arsenal = new Arsenal();
  assert.equal(hasEscortLink(own), true);
  assert.equal(hasFireControlLink(own), true);
  assert.equal(arsenal.maxUses("phantom", own), 2);
  assert.equal(arsenal.maxUses("harpoon", own), 3);
  own.attack({ x: 0, y: 2 });
  own.attack({ x: 1, y: 2 });
  assert.equal(hasEscortLink(own), false);
  assert.equal(hasFireControlLink(own), true);
});

test("escort grants one additional F-4 sortie while both ships survive", () => {
  const own = new Board();
  own.placeShip("carrier", { x: 0, y: 0 }, "east");
  own.placeShip("escort", { x: 0, y: 2 }, "east");
  const arsenal = new Arsenal();
  assert.equal(hasEscortLink(own), true);
  assert.equal(arsenal.availableUses("phantom", own), 2);
  assert.equal(arsenal.spend("phantom", own), true);
  assert.equal(arsenal.availableUses("phantom", own), 1);
  own.attack({ x: 0, y: 2 }); own.attack({ x: 1, y: 2 });
  assert.equal(arsenal.availableUses("phantom", own), 0);
  assert.equal(arsenal.spend("phantom", own), false);
});

test("an escort outside the carrier screen does not add an F-4 sortie", () => {
  const own = new Board();
  own.placeShip("carrier", { x: 0, y: 0 }, "east");
  own.placeShip("escort", { x: 0, y: 3 }, "east");
  const arsenal = new Arsenal();
  assert.equal(hasEscortLink(own), false);
  assert.equal(arsenal.maxUses("phantom", own), 1);
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
  const fleet = [...FULL_FLEET];
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
