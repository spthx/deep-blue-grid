import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("all mode and library entry points pass through authorization guards", () => {
  assert.match(game, /const canEnterMode = \(mode: ProgressionMode\)/);
  assert.match(game, /const canOpenMissionSection = \(section: MissionLibrarySection\)/);
  assert.match(game, /const startCampaign = \(selectedDifficulty: GameMode[\s\S]*?if \(!canEnterMode\(progressionMode\)\) return;/);
  assert.match(game, /const openMissionLibrary = \(section:[\s\S]*?if \(!canOpenMissionSection\(section\)\) return;/);
  for (const mode of ["training", "casual", "tactics", "mission", "survival"]) {
    assert.match(game, new RegExp(`aria-disabled=\\{!progressionAccess\\.${mode}\\.allowed\\}`));
  }
  assert.match(game, /library-access-notice/);
});

test("debug authorization is visible and cannot write result progression", () => {
  assert.match(game, /debugUnlockAllFromSearch\(window\.location\.search\)/);
  assert.match(game, /DEBUG AUTHORIZATION \/ 全作戦開放/);
  assert.match(game, /進行・教程・任務記録は保存されません/);
  assert.match(game, /const recordModeCompletion = \(mode: ProgressionMode\) => \{\s*if \(debugAll\) return;/);
  assert.match(game, /if \(!debugAll\) \{\s*const update = updateStoredTrainingProgress/);
  assert.match(game, /if \(debugAll\) \{\s*setMissionRecordUpdate\(null\);/);
});

test("record persistence failure is visibly reported instead of silently losing progress", () => {
  assert.match(game, /LOCAL RECORD NOT SAVED/);
  assert.match(game, /setPersistenceWarning/);
  assert.match(css, /\.persistence-warning/);
});

test("deployment lesson requires a real movable and rotatable placement", () => {
  assert.match(game, /if \(!nextRule\.training\?\.placementDrill\) deployScenarioFleet/);
  assert.match(game, /const interactivePlacement = !missionRule \|\| Boolean\(placementDrill\)/);
  assert.match(game, /placementDrill\.placements\.find/);
  assert.match(game, /actual\.orientation !== expected\.orientation/);
  assert.match(game, /TRAINING HOLD：\$\{placementDrill\.instruction\}/);
  assert.match(game, /艦を選択 → ドラッグで移動 → ROTATEで回転 → LOCKで配置決定/);
});

test("damage-report lesson pauses after the scripted hit until acknowledgment", () => {
  assert.match(game, /const runTrainingEnemyDemonstration = async \(\) =>/);
  assert.match(game, /player\.current\.attack\(demonstration\.target\)/);
  assert.match(game, /setMessage\(`DAMAGE REPORT：\$\{demonstration\.damageReport\.join/);
  assert.match(game, /setPhase\("review"\)/);
  assert.match(game, /const reviewConfirmLabel = missionRule\?\.training\?\.enemyDemonstration\?\.acknowledgmentLabel/);
  assert.equal((game.match(/<b>\{reviewConfirmLabel\}<\/b>/g) ?? []).length, 2);
});

test("unlock rail and notices reflow for compact screens", () => {
  assert.match(css, /\.clearance-rail/);
  assert.match(css, /\.new-authorization/);
  assert.match(css, /\.debug-authorization-banner/);
  assert.match(css, /@media \(max-width:980px\)[\s\S]*?\.clearance-rail/);
});
