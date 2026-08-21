import assert from "node:assert/strict";
import test from "node:test";
import { TRAINING_STAGES } from "../app/game/Campaign.ts";
import {
  TRAINING_LESSONS,
  completeTrainingLesson,
  createEmptyTrainingProgress,
  nextIncompleteTrainingLesson,
  parseTrainingProgress,
  serializeTrainingProgress,
} from "../app/game/TrainingProgress.ts";
import { validateMissionLibrary } from "../app/game/MissionRules.ts";
import { validateTrainingLibrary } from "../app/game/TrainingRules.ts";
import { Board, criticalCoordFor } from "../app/game/engine.ts";
import { applyScenarioHits, deployScenarioFleet } from "../app/game/MissionRules.ts";

const stage = (lesson: number) => {
  const value = TRAINING_STAGES.find((candidate) => candidate.training?.lesson === lesson);
  assert.ok(value, `lesson ${lesson} exists`);
  return value;
};

test("expanded training keeps stable IDs and follows the beginner-first route", () => {
  assert.deepEqual(TRAINING_LESSONS, [7, 1, 2, 3, 4, 5, 6, 8, 9]);
  assert.deepEqual(
    TRAINING_STAGES.map((candidate) => candidate.training!.lesson),
    TRAINING_LESSONS,
  );
  assert.deepEqual(
    TRAINING_STAGES.map((candidate) => candidate.id),
    [107, 101, 102, 103, 104, 105, 106, 108, 109],
  );
  assert.equal(nextIncompleteTrainingLesson(createEmptyTrainingProgress()), 7);
});

test("version-one progress survives expansion and serializes in route order", () => {
  const migrated = parseTrainingProgress(JSON.stringify({
    version: 1,
    completedLessons: [9, 3, 1, 7, 7, 99],
  }));
  assert.deepEqual(migrated.completedLessons, [7, 1, 3, 9]);
  assert.equal(serializeTrainingProgress(migrated), '{"version":1,"completedLessons":[7,1,3,9]}');
  assert.deepEqual(completeTrainingLesson(migrated, 102).completedLessons, [7, 1, 2, 3, 9]);
  assert.deepEqual(completeTrainingLesson(migrated, 108).completedLessons, [7, 1, 3, 8, 9]);
  assert.equal(nextIncompleteTrainingLesson(migrated), 2);
});

test("lesson 7 exposes a deterministic deployment drill before first fire", () => {
  const lesson = stage(7);
  const drill = lesson.training!.placementDrill;
  assert.ok(drill);
  assert.deepEqual(drill.placements, lesson.playerPlacements);
  assert.deepEqual(drill.placements, [
    { id: "destroyer", start: { x: 1, y: 4 }, orientation: "south" },
  ]);
  assert.match(lesson.training!.plainBrief, /E-2～G-2/);
  assert.match(drill.instruction, /ROTATE/);
  assert.deepEqual(lesson.training!.steps[0].expected, {
    weapon: "fire",
    target: { x: 3, y: 3 },
  });
});

test("lesson 8 scripts one real damage cell and a persistent report acknowledgment", () => {
  const lesson = stage(8);
  const demo = lesson.training!.enemyDemonstration;
  assert.ok(demo);
  assert.deepEqual(demo.target, { x: 1, y: 5 });
  assert.equal(demo.ship, "destroyer");
  assert.equal(demo.result, "hit");
  assert.deepEqual(lesson.playerInitialHits, [demo.target]);
  assert.match(demo.acknowledgmentLabel, /損傷報告/);

  const friendly = new Board();
  deployScenarioFleet(friendly, lesson.playerPlacements);
  applyScenarioHits(friendly, lesson.playerInitialHits);
  const destroyer = friendly.ships.find((ship) => ship.id === "destroyer")!;
  assert.equal(destroyer.hits.size, 1);
  assert.equal(destroyer.sunk, false);
});

test("lesson 9 pairs the authored important section with MK-45 II two-point fire", () => {
  const lesson = stage(9);
  const hostile = new Board();
  deployScenarioFleet(hostile, lesson.enemyPlacements);
  applyScenarioHits(hostile, lesson.enemyInitialHits);
  assert.deepEqual(criticalCoordFor("cruiser", { x: 2, y: 2 }, "east"), { x: 4, y: 2 });

  const order = lesson.training!.steps[0].expected;
  assert.equal(order.weapon, "mk45");
  if (order.weapon !== "mk45") return;
  assert.deepEqual(order.targets, [{ x: 4, y: 2 }, { x: 3, y: 2 }]);
  const results = order.targets.map((target) => hostile.attack(target));
  assert.equal(results[0].criticalHit, true);
  assert.equal(results[0].shipId, "cruiser");
  assert.equal(results[1].kind, "SUNK");
  assert.equal(hostile.allSunk(), true);
});

test("the full expanded training library remains deterministic and valid", () => {
  assert.deepEqual(validateMissionLibrary(TRAINING_STAGES), []);
  assert.deepEqual(validateTrainingLibrary(TRAINING_STAGES), []);
  assert.ok(TRAINING_STAGES.every((candidate) => candidate.aiSkill === 0));
  assert.ok(TRAINING_STAGES.every((candidate) => candidate.training?.suppressEnemyActions === true));
});
