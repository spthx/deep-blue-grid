import assert from "node:assert/strict";
import test from "node:test";
import { ADDITIONAL_MISSIONS } from "../app/game/AdditionalMissions.ts";
import { MISSION_LIBRARY } from "../app/game/Campaign.ts";
import { validateMissionLibrary } from "../app/game/MissionRules.ts";
import { CANONICAL_MISSION_ROUTES, planPolicy, simulateMission, type MissionAction } from "../scripts/measure-missions.ts";

const c = (x: number, y: number) => ({ x, y });

type ProofRoute = Readonly<{
  rationale: string;
  publicEvidence: readonly string[];
  actions: readonly MissionAction[];
}>;

/** Kept in tests so solution coordinates can never leak into the production bundle. */
const PROOF_ROUTES: Readonly<Record<number, ProofRoute>> = {
  23: {
    rationale: "MK-45 II accepts both equally disclosed fixes in one order, so no guess is required.",
    publicEvidence: ["TRACK ALPHA / C-3", "TRACK BRAVO / F-6"],
    actions: [{ weapon: "mk45", targets: [c(2, 2), c(5, 5)] }],
  },
  24: {
    rationale: "The plotted four-section cruiser track is the complete F-4 allocation after the fixed opening salvo.",
    publicEvidence: ["BREAKER / C-5", "BREAKER / D-5", "BREAKER / E-5", "BREAKER / F-5"],
    actions: [{ weapon: "phantom", targets: [c(2, 4), c(3, 4), c(4, 4), c(5, 4)] }],
  },
  25: {
    rationale: "A north-facing fan from D-5 covers the three published residual sections C-4 through E-4.",
    publicEvidence: ["COLUMN / C-4", "NEEDLE / D-4", "PICKET / E-4"],
    actions: [{ weapon: "sparrow", anchor: c(3, 4), orientation: "north" }],
  },
  26: {
    rationale: "One F-4 order can strike all four published control-section estimates and identify each hull.",
    publicEvidence: ["AIR CONTROL / C-1", "MAIN DIRECTOR / C-4", "PLOT ROOM / C-6", "LOCAL CONTROL / G-8"],
    actions: [{ weapon: "phantom", targets: [c(2, 0), c(2, 3), c(2, 5), c(6, 7)] }],
  },
  27: {
    rationale: "The 0748Z FLASH gives the order; the preceding three entries give the matching last sections.",
    publicEvidence: ["0742Z", "0744Z", "0746Z", "0748Z"],
    actions: [
      { weapon: "fire", target: c(6, 1) },
      { weapon: "fire", target: c(3, 4) },
      { weapon: "fire", target: c(1, 6) },
    ],
  },
  28: {
    rationale: "The prescribed ALPHA report authorizes the published D-4 crossing salvo over both plotted residual contacts.",
    publicEvidence: ["ALPHA / C-3:D-4", "VECTOR LAST SECTION / C-3", "SUBMERGED FIX / E-5", "FIRING CENTER / D-4"],
    actions: [
      { weapon: "radar", origin: c(2, 2) },
      { weapon: "harpoon", center: c(3, 3) },
    ],
  },
};

test("additional mission definitions are statically legal and globally unique", () => {
  assert.equal(ADDITIONAL_MISSIONS.length, 6);
  assert.deepEqual(ADDITIONAL_MISSIONS.map((mission) => mission.id), [23, 24, 25, 26, 27, 28]);
  assert.deepEqual(ADDITIONAL_MISSIONS.map((mission) => mission.difficulty), [3, 4, 4, 5, 5, 6]);
  assert.deepEqual(validateMissionLibrary(MISSION_LIBRARY), []);
  assert.ok(ADDITIONAL_MISSIONS.every((mission) => MISSION_LIBRARY.includes(mission)));

  const originalMissions = MISSION_LIBRARY.filter((mission) => mission.id < 23);
  const existingTitles = new Set(originalMissions.map((mission) => mission.title));
  assert.ok(ADDITIONAL_MISSIONS.every((mission) => !existingTitles.has(mission.title)));

  const mechanicalSignature = (mission: (typeof ADDITIONAL_MISSIONS)[number]) => {
    const targets = mission.objective.kind === "sonar-reports" ? [] : [...mission.objective.targets].sort();
    const reportCount = mission.objective.kind === "sonar-reports" || mission.objective.kind === "scan-and-destroy"
      ? mission.objective.reports.length
      : 0;
    return [
      mission.objective.kind,
      targets.join(","),
      reportCount,
      mission.objective.maxFriendlyActions,
      [...mission.allowedWeapons].sort().join(","),
      mission.enemyFirst ? "enemy-first" : "friendly-first",
      `known:${[...mission.enemyDisclosure.known].sort().join(",")}`,
      `plots:${mission.enemyDisclosure.candidateCells?.length ?? 0}`,
    ].join("|");
  };
  const existingSignatures = new Set(originalMissions.map(mechanicalSignature));
  assert.ok(ADDITIONAL_MISSIONS.every((mission) => !existingSignatures.has(mechanicalSignature(mission))));
  assert.equal(new Set(ADDITIONAL_MISSIONS.map(mechanicalSignature)).size, ADDITIONAL_MISSIONS.length);
});

test("all additional missions have deterministic legal victory routes", () => {
  for (const mission of ADDITIONAL_MISSIONS) {
    const route = PROOF_ROUTES[mission.id];
    assert.ok(route, `${mission.title}: proof route missing`);
    assert.deepEqual(route.actions, CANONICAL_MISSION_ROUTES[mission.id]?.actions, `${mission.title}: proof and release canonical routes diverged`);
    const result = simulateMission(mission, planPolicy(route.actions));
    assert.equal(result.illegalAction, undefined, `${mission.title}: ${result.illegalAction}`);
    assert.equal(result.outcome?.result, "victory", `${mission.title}: ${result.outcome?.report ?? "no outcome"}`);
    assert.equal(result.actions, route.actions.length, `${mission.title}: proof route ended early`);
    assert.ok(result.actions <= mission.objective.maxFriendlyActions, `${mission.title}: proof exceeds deadline`);
  }
});

test("proof routes cite only information exposed by their mission definitions", () => {
  for (const mission of ADDITIONAL_MISSIONS) {
    const route = PROOF_ROUTES[mission.id];
    const disclosed = [
      mission.directive,
      mission.condition,
      mission.enemyDisclosure.summary,
      ...(mission.enemyDisclosure.candidateCells ?? []).map((candidate) => candidate.code),
      ...(mission.archiveLog ?? []).flatMap((entry) => [entry.time, entry.text]),
      ...(mission.objective.kind === "sonar-reports" || mission.objective.kind === "scan-and-destroy"
        ? mission.objective.reports.map((report) => report.code)
        : []),
    ].join("\n");
    for (const clue of route.publicEvidence) {
      assert.ok(disclosed.includes(clue), `${mission.title}: proof cites undisclosed evidence ${clue}`);
    }
    assert.ok(!route.rationale.includes("enemyPlacements"), `${mission.title}: proof depends on private deployment data`);
  }
});
