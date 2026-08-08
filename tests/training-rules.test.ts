import assert from "node:assert/strict";
import test from "node:test";
import { EXTREME_MISSIONS, TRAINING_STAGES, aiSkillFor, friendlyStarts, huntBreadthFor, isSilentStage, missionRuleFor, routeUnit, stagesFor, usesTacticsRules } from "../app/game/Campaign.ts";
import { applyScenarioHits, deployScenarioFleet, missionObjectiveComplete, validateMissionLibrary } from "../app/game/MissionRules.ts";
import { missionOrdersEqual, sameTargetSet, validateTrainingLibrary } from "../app/game/TrainingRules.ts";
import { Board, harpoonCells, straddleCells } from "../app/game/engine.ts";
import type { Coord, ShipId } from "../app/game/constants.ts";

test("training exposes six isolated fixed lessons", () => {
  assert.equal(stagesFor("training"), TRAINING_STAGES);
  assert.deepEqual(TRAINING_STAGES.map((stage) => stage.id), [101, 102, 103, 104, 105, 106]);
  assert.deepEqual(TRAINING_STAGES.map((stage) => stage.title), [
    "TACTICAL PLOT",
    "ACOUSTIC BEARING",
    "CROSS FIX",
    "ESCORT SUPPORT",
    "FIRE CONTROL LINK",
    "SILENT TRACE",
  ]);
  assert.ok(TRAINING_STAGES.every((stage) => stage.category === "training" && stage.training?.suppressEnemyActions));
  assert.deepEqual(validateMissionLibrary(TRAINING_STAGES), []);
  assert.deepEqual(validateTrainingLibrary(TRAINING_STAGES), []);
});

test("training campaign helpers keep the route separate and deterministic", () => {
  const first = TRAINING_STAGES[0];
  assert.equal(missionRuleFor("training", first), first);
  assert.equal(missionRuleFor("mission", first), null);
  assert.equal(usesTacticsRules("training"), true);
  assert.equal(aiSkillFor("training", first.id, first.aiSkill), 0);
  assert.equal(huntBreadthFor("training", 0), 1);
  assert.equal(friendlyStarts("training", first), true);
  assert.deepEqual(routeUnit("training"), { english: "LESSON", japanese: "訓練" });
  assert.equal(isSilentStage("survival", { id: 5, title: "SEA BAT", subtitle: "", fleet: ["silentSubmarine"], aiSkill: 1 }), true);
  assert.equal(isSilentStage("mission", EXTREME_MISSIONS.find((stage) => stage.id === 21)!), true);
  assert.equal(isSilentStage("training", first), false);
});

test("multi-target training orders compare as sets without accepting duplicates", () => {
  const left = [{ x: 2, y: 1 }, { x: 4, y: 5 }];
  const reversed = [...left].reverse();
  assert.equal(sameTargetSet(left, reversed), true);
  assert.equal(sameTargetSet(left, [left[0], left[0]]), false);
  assert.equal(missionOrdersEqual(
    { weapon: "mk45", targets: left },
    { weapon: "mk45", targets: reversed },
  ), true);
  assert.equal(missionOrdersEqual(
    { weapon: "sparrow", anchor: { x: 4, y: 4 }, orientation: "north" },
    { weapon: "sparrow", anchor: { x: 4, y: 4 }, orientation: "south" },
  ), false);
});

test("every training instruction names the coordinates it actually authorizes", () => {
  const label = ({ x, y }: Coord) => `${String.fromCharCode(65 + y)}-${x + 1}`;
  for (const stage of TRAINING_STAGES) {
    for (const step of stage.training!.steps) {
      const order = step.expected;
      const coordinates = order.weapon === "fire" ? [order.target]
        : order.weapon === "radar" ? [order.origin]
          : order.weapon === "harpoon" ? [order.center]
            : order.weapon === "sparrow" ? [order.anchor]
              : order.targets;
      for (const coord of coordinates) {
        assert.match(step.instruction, new RegExp(label(coord)), `${stage.title}: ${step.title}`);
      }
    }
  }
});

test("each instructed order completes its fixed lesson board", () => {
  for (const stage of TRAINING_STAGES) {
    const hostile = new Board();
    deployScenarioFleet(hostile, stage.enemyPlacements);
    applyScenarioHits(hostile, stage.enemyInitialHits);
    for (const intel of stage.initialIntel ?? []) hostile.attack(intel.coord);

    const enemySunk: ShipId[] = [];
    const sonarReports: Array<{ origin: Coord; contact: boolean }> = [];
    for (const step of stage.training!.steps) {
      const order = step.expected;
      if (order.weapon === "radar") {
        sonarReports.push({ origin: order.origin, contact: hostile.radar(order.origin) });
        continue;
      }
      const targets = order.weapon === "fire" ? [order.target]
        : order.weapon === "harpoon" ? harpoonCells(order.center)
          : order.weapon === "sparrow" ? straddleCells(order.anchor, order.orientation)
            : order.targets;
      for (const target of targets) {
        const result = hostile.attack(target);
        if (result.kind === "SUNK" && result.shipId) enemySunk.push(result.shipId);
      }
    }
    assert.equal(missionObjectiveComplete(stage, {
      friendlyActions: stage.training!.steps.length,
      enemySunk,
      friendlyAlive: [...stage.playerFleet],
      sonarReports,
    }), true, stage.title);
  }
});
