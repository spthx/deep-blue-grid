import assert from "node:assert/strict";
import test from "node:test";
import { MISSION_LIBRARY } from "../app/game/Campaign.ts";
import { applyMissionResult, createEmptyMissionRecords } from "../app/game/MissionRecords.ts";
import {
  MODE_ROUTE,
  PROGRESSION_STORAGE_KEY,
  commitModeCompletion,
  completeMode,
  createEmptyProgression,
  debugUnlockAllFromSearch,
  isTrainingLessonUnlocked,
  loadProgression,
  migrateLegacyProgression,
  missionQualificationComplete,
  missionQualificationMarks,
  modeAccess,
  progressionSerializedStatus,
  parseProgression,
  saveProgression,
  serializeProgression,
  updateStoredModeCompletion,
} from "../app/game/Progression.ts";
import {
  MODE_AUTHORIZATION_PRESENTATIONS,
  buildModeAuthorizationSequence,
} from "../app/game/ModeAuthorization.ts";
import { createEmptyTrainingProgress, completeTrainingLesson } from "../app/game/TrainingProgress.ts";

test("fresh progression exposes every mode without marking any as completed", () => {
  let state = createEmptyProgression();
  assert.deepEqual(MODE_ROUTE.map((mode) => modeAccess(state, mode).allowed), [true, true, true, true, true]);
  assert.deepEqual(state.completedModes, []);
  assert.deepEqual(completeMode(state, "tactics").completedModes, ["tactics"]);

  for (const mode of MODE_ROUTE) {
    state = completeMode(state, mode);
  }
  assert.deepEqual(state.completedModes, MODE_ROUTE);
  assert.equal(completeMode(state, "survival"), state);
});

test("stored progression is canonical, monotonic and safe around corrupt data", () => {
  assert.deepEqual(parseProgression("broken"), createEmptyProgression());
  assert.deepEqual(parseProgression(JSON.stringify({ version: 99, completedModes: ["training"] })), createEmptyProgression());
  assert.deepEqual(parseProgression(JSON.stringify({
    version: 1,
    completedModes: ["tactics", "training", "training", "survival", "casual", "bogus"],
  })).completedModes, ["training", "casual", "tactics"]);

  const complete = MODE_ROUTE.reduce((state, mode) => completeMode(state, mode), createEmptyProgression());
  assert.equal(serializeProgression(complete), '{"version":2,"completedModes":["training","casual","tactics","mission","survival"]}');
});

test("invalid progression falls back to legacy evidence while future saves are identified for preservation", () => {
  const evidence = { trainingComplete: true, hasMissionRecord: true, missionQualified: true };
  const invalidStorage = { getItem() { return "{broken"; }, setItem() {} };
  const futureStorage = { getItem() { return '{"version":3,"completedModes":["training"]}'; }, setItem() {} };
  assert.equal(progressionSerializedStatus("{broken"), "invalid");
  assert.equal(progressionSerializedStatus(futureStorage.getItem()), "future");
  assert.deepEqual(loadProgression(invalidStorage, evidence).completedModes, ["training", "mission"]);
  assert.deepEqual(loadProgression(futureStorage, evidence).completedModes, ["training", "mission"]);
});

test("a valid empty intermediate save is monotonically recovered from older completion evidence", () => {
  const storage = { getItem() { return '{"version":1,"completedModes":[]}'; }, setItem() {} };
  const evidence = { trainingComplete: true, hasMissionRecord: false, missionQualified: false };
  assert.deepEqual(loadProgression(storage, evidence).completedModes, ["training"]);
});

test("legacy evidence restores verifiable achievements without inventing prerequisite clears", () => {
  assert.deepEqual(migrateLegacyProgression({ trainingComplete: true, hasMissionRecord: false, missionQualified: false }).completedModes, ["training"]);
  assert.deepEqual(migrateLegacyProgression({ trainingComplete: false, hasMissionRecord: true, missionQualified: false }).completedModes, []);
  assert.deepEqual(migrateLegacyProgression({ trainingComplete: false, hasMissionRecord: true, missionQualified: true }).completedModes, ["mission"]);
});

test("mission qualification requires tactical difficulties one through five and an archive", () => {
  let records = createEmptyMissionRecords();
  const qualifying = [1, 2, 3, 4, 5].map((difficulty) =>
    MISSION_LIBRARY.find((mission) => mission.category === "standard" && mission.difficulty === difficulty)!).concat(
      MISSION_LIBRARY.find((mission) => mission.category === "archive")!,
    );
  for (const [index, mission] of qualifying.entries()) {
    records = applyMissionResult(records, { missionId: mission.id, result: "victory", commands: 1, activeMs: 1000 }).records;
    assert.equal(missionQualificationComplete(records, MISSION_LIBRARY), index === qualifying.length - 1);
  }
  assert.deepEqual(missionQualificationMarks(records, MISSION_LIBRARY).map((mark) => mark.complete), [true, true, true, true, true, true]);
});

test("optional training opens all valid lessons without prerequisites", () => {
  const sequence = [7, 1, 2, 3];
  let progress = createEmptyTrainingProgress();
  assert.deepEqual(sequence.map((lesson) => isTrainingLessonUnlocked(progress, lesson, sequence)), [true, true, true, true]);
  progress = completeTrainingLesson(progress, 7);
  assert.deepEqual(sequence.map((lesson) => isTrainingLessonUnlocked(progress, lesson, sequence)), [true, true, true, true]);
  assert.equal(isTrainingLessonUnlocked(progress, 3, sequence, true), true);
  assert.equal(isTrainingLessonUnlocked(progress, 999, sequence), false);
});

test("legacy lesson records never gate the new optional lessons", () => {
  const sequence = [7, 1, 2, 3, 4, 5, 6, 8, 9];
  let progress = { version: 1 as const, completedLessons: [1, 2, 3, 4, 5, 6] };
  assert.deepEqual(
    sequence.map((lesson) => isTrainingLessonUnlocked(progress, lesson, sequence)),
    [true, true, true, true, true, true, true, true, true],
  );
  progress = completeTrainingLesson(progress, 7);
  assert.equal(isTrainingLessonUnlocked(progress, 8, sequence), true);
  assert.equal(isTrainingLessonUnlocked(progress, 9, sequence), true);
});

test("debug query grants runtime access without entering serialized progression", () => {
  const empty = createEmptyProgression();
  assert.equal(debugUnlockAllFromSearch("?debug=all"), true);
  assert.equal(debugUnlockAllFromSearch("?debug=all-modes"), false);
  assert.ok(MODE_ROUTE.every((mode) => modeAccess(empty, mode, true).allowed));
  assert.equal(serializeProgression(empty), '{"version":2,"completedModes":[]}');
});

test("clearing survival first persists only survival and survives legacy evidence recovery", () => {
  const memory = new Map<string, string>();
  const storage = { getItem(key:string) { return memory.get(key) ?? null; }, setItem(key:string,value:string) { memory.set(key,value); } };
  const result = commitModeCompletion(createEmptyProgression(), "survival", storage);
  assert.equal(result.wrote, true);
  assert.deepEqual(loadProgression(storage).completedModes, ["survival"]);
  assert.deepEqual(parseProgression(serializeProgression(result.progression)), result.progression);
  const restored = loadProgression(storage, { trainingComplete:true,hasMissionRecord:false,missionQualified:false });
  assert.deepEqual(restored.completedModes, ["training","survival"]);
  assert.ok(MODE_ROUTE.every(mode=>modeAccess(restored,mode).allowed));
});

test("progression storage helpers tolerate unavailable storage", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem(key: string) { return memory.get(key) ?? null; },
    setItem(key: string, value: string) { memory.set(key, value); },
  };
  assert.equal(saveProgression(createEmptyProgression(), storage), true);
  assert.equal(memory.has(PROGRESSION_STORAGE_KEY), true);
  const update = updateStoredModeCompletion("training", storage);
  assert.equal(update.persisted, true);
  assert.deepEqual(loadProgression(storage).completedModes, ["training"]);

  const failing = { getItem() { throw new Error("no read"); }, setItem() { throw new Error("no write"); } };
  assert.deepEqual(loadProgression(failing), createEmptyProgression());
  assert.equal(saveProgression(createEmptyProgression(), failing), false);
});

test("a mode clear writes progression once, is idempotent, and restores after reload", () => {
  const memory = new Map<string, string>();
  let writes = 0;
  const storage = {
    getItem(key: string) { return memory.get(key) ?? null; },
    setItem(key: string, value: string) { writes += 1; memory.set(key, value); },
  };
  const first = commitModeCompletion(createEmptyProgression(), "training", storage);
  assert.deepEqual(first, {
    progression: { version: 2, completedModes: ["training"] },
    changed: true,
    persisted: true,
    wrote: true,
    writeProtected: false,
  });
  assert.equal(writes, 1);
  assert.deepEqual(loadProgression(storage), first.progression);

  const duplicate = commitModeCompletion(first.progression, "training", storage);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.wrote, false);
  assert.equal(writes, 1);

  let routeProgress = first.progression;
  for (const mode of MODE_ROUTE.slice(1)) {
    const clear = commitModeCompletion(routeProgress, mode, storage);
    assert.equal(clear.wrote, true);
    routeProgress = clear.progression;
  }
  assert.equal(writes, MODE_ROUTE.length);
  assert.deepEqual(loadProgression(storage).completedModes, MODE_ROUTE);
});

test("debug completion performs no mutation or write", () => {
  let writes = 0;
  const storage = { getItem() { return null; }, setItem() { writes += 1; } };
  const initial = createEmptyProgression();
  const result = commitModeCompletion(initial, "training", storage, { write: false });
  assert.equal(result.progression, initial);
  assert.equal(result.changed, false);
  assert.equal(result.wrote, false);
  assert.equal(writes, 0);
});

test("mode completion reports write failure and protects future-version records", () => {
  const failing = { getItem() { return null; }, setItem() { throw new Error("storage denied"); } };
  const failed = commitModeCompletion(createEmptyProgression(), "training", failing);
  assert.equal(failed.changed, true);
  assert.equal(failed.persisted, false);
  assert.equal(failed.wrote, false);
  assert.equal(failed.writeProtected, false);

  let writes = 0;
  const future = {
    getItem() { return '{"version":3,"completedModes":["training"]}'; },
    setItem() { writes += 1; },
  };
  const protectedResult = commitModeCompletion(createEmptyProgression(), "training", future);
  assert.equal(protectedResult.changed, true);
  assert.equal(protectedResult.persisted, false);
  assert.equal(protectedResult.writeProtected, true);
  assert.equal(writes, 0);
});

test("every completed mode has a two-scene feature briefing for the actual route", () => {
  assert.deepEqual(MODE_ROUTE.map((mode) => MODE_AUTHORIZATION_PRESENTATIONS[mode].authorized), [
    "casual",
    "tactics",
    "mission",
    "survival",
    "extreme",
  ]);
  for (const mode of MODE_ROUTE) {
    const presentation = MODE_AUTHORIZATION_PRESENTATIONS[mode];
    assert.equal(presentation.features.length, 3);
    assert.ok(presentation.features.every(Boolean));
    const sequence = buildModeAuthorizationSequence(mode);
    assert.equal(sequence.kind, "operation-clear");
    assert.equal(sequence.cues.length, 2);
    assert.match(sequence.cues[1].title, /AVAILABLE$/);
    assert.deepEqual(sequence.cues[1].facts, presentation.features);
  }
  assert.match(buildModeAuthorizationSequence("training", false).cues[0].facts.join(" "), /保存未完了/);
});
