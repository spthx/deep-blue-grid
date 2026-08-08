import assert from "node:assert/strict";
import test from "node:test";

import { verifyCanonicalMissions } from "../scripts/measure-missions.ts";

test("all twenty-two missions have a legal deterministic victory route", () => {
  const results = verifyCanonicalMissions();
  assert.equal(results.length, 22);
  for (const { mission, route, simulation } of results) {
    assert.equal(simulation.illegalAction, undefined, `${mission.title}: ${simulation.illegalAction}`);
    assert.equal(simulation.outcome?.result, "victory", `${mission.title}: ${simulation.outcome?.report ?? "no outcome"}`);
    assert.ok(simulation.actions <= mission.objective.maxFriendlyActions, `${mission.title}: route exceeded order limit`);
    assert.equal(simulation.actions, route.actions.length, `${mission.title}: route did not execute completely`);
  }
});
