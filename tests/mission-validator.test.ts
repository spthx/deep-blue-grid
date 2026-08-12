import assert from "node:assert/strict";
import test from "node:test";

import { MISSION_LIBRARY } from "../app/game/Campaign.ts";
import { validateMissionDefinition, validateMissionLibrary } from "../app/game/MissionRules.ts";

const copy = <T,>(value: T): T => structuredClone(value);

test("mission authoring validator rejects unstable numeric and duplicate contracts", () => {
  const invalid = copy(MISSION_LIBRARY[0]);
  invalid.objective.maxFriendlyActions = 0;
  invalid.allowedWeapons.push(invalid.allowedWeapons[0]);
  invalid.playerInitialHits = [invalid.playerPlacements[0].start, invalid.playerPlacements[0].start];
  invalid.huntBreadth = 0;
  invalid.fixedSeed = -1;

  const issues = validateMissionDefinition(invalid);
  assert.ok(issues.some((issue) => issue.includes("maxFriendlyActions")));
  assert.ok(issues.some((issue) => issue.includes("allowedWeapons contains a duplicate")));
  assert.ok(issues.some((issue) => issue.includes("initial hit is duplicated")));
  assert.ok(issues.some((issue) => issue.includes("huntBreadth")));
  assert.ok(issues.some((issue) => issue.includes("fixedSeed")));
});

test("mission authoring validator verifies declared sonar truth against the authored board", () => {
  const source = MISSION_LIBRARY.find((mission) => mission.objective.kind === "sonar-reports")!;
  const invalid = copy(source);
  if (invalid.objective.kind !== "sonar-reports") throw new Error("sonar fixture changed");
  invalid.objective.reports[0].contact = !invalid.objective.reports[0].contact;

  assert.ok(validateMissionDefinition(invalid).some((issue) => issue.includes("declares") && issue.includes("resolved")));
});

test("mission library validator rejects duplicate category ordering and impossible archive time", () => {
  const first = copy(MISSION_LIBRARY[0]);
  const second = copy(MISSION_LIBRARY[1]);
  second.sortOrder = first.sortOrder;
  const archive = copy(MISSION_LIBRARY.find((mission) => mission.category === "archive")!);
  archive.archiveLog![0].time = "2460Z";

  const issues = validateMissionLibrary([first, second, archive]);
  assert.ok(issues.some((issue) => issue.includes("duplicate standard sortOrder")));
  assert.ok(issues.some((issue) => issue.includes("invalid archive timestamp: 2460Z")));
});
